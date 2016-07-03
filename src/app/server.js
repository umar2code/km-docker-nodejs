
//setup all required modules
var restify = require('restify');
var r = require('rethinkdb');
var https = require('https');
var keypair = require('keypair');
var forge = require('node-forge');

//set env variable so that server is fine with api that orginate from unknown certs
//this is specifically for VMs that are generated on the cloud and dont have a cert from CA
process.env.NODE_TLS_REJECT_UNAUTHORIZED=0;
var config = require('./config');
var databaseController = require('./controllers/databaseController');
var server = restify.createServer();

var connection = null;
/*
First step is to connect to the rethindb based on the config.js and then create a database called and a table called key if they donot exist. If they exist
no new db or table are created. A restify server is also started.
 */
r.connect(config.rethinkdb, function(err, conn) {
        if (err) {
            console.log('Could not open a connection to initialize the database: ' + err.message);
        }
        else {
            console.log('Connected.');
           connection = conn;
            databaseController.createDatabase(conn, config.rethinkdb.db)
                .then(function() {
                    return databaseController.createTable(conn, 'keys');
                })
                .catch(function(err) {
                    console.log('Error creating database and/or table: ' + err);
                });
        }
    });




server.use(restify.bodyParser());
server.use(restify.requestLogger());

//this function is for the get operation.

function getKey(req, res, next) {
  var requestName=req.params.keyName;
  console.log("Got a request with param: "+requestName );


  r.db('key').table('keys').filter({keyName:requestName}).orderBy(r.desc("timestamp")).pluck('keyValue').run(connection, function(err, cursor) {
    if(err) {
      return next(err);
    }

    cursor.toArray(function(err, result) {
      if(err) {
        return next(err);
      }
      console.log("Result:"+result[0].keyValue);
      res.send(result[0].keyValue);
      return next();
    });

  });
}
//this is for post operation, keyName and keyValue have to be specified in the body. 
function postKey(req, res, next) {
     var keyName = req.params.keyName;
     var keyValue = req.params.keyValue;
     //keyValue = new Buffer(req.params.keyValue).toString('base64');
     console.log("Value of Key in rethinkdb is   "+keyValue);
  r.table('keys').insert([
          { 
            keyName: keyName,
            keyValue: keyValue,
            timestamp: new Date()
          }
      ]).run(connection, function(err, result) {
          if (err) throw err;
          console.log(JSON.stringify(result, null, 2));
          res.send(201, Math.random().toString(36).substr(3, 8));
        return next();
      });  
 }




// This API generates passphrase less RSA Keypair based on the input comment(email provided).
//input email and username and keyname and it will store the key with that user info:

function generateKeyPair(req, res, next){

  var comment = req.params.email;
  var keyName = req.params.keyName;
  var pair = keypair();
  var publicKey = forge.pki.publicKeyFromPem(pair.public);
  var publicKeySSH = forge.ssh.publicKeyToOpenSSH(publicKey, comment);


  r.table('keys').insert([
          { 
            username: req.params.username,
            baseKeyName: keyName,
            publicKeyName: keyName+'_public',
            privateKeyName: keyName+'_private',
            publicKeyValue: publicKeySSH,
            privateKeyValue: pair.private,
            timestamp: new Date()
          }
      ]).run(connection, function(err, result) {
          if (err) throw err;
          console.log(JSON.stringify(result, null, 2));
          res.send(200, Math.random().toString(36).substr(3, 8));
        return next();
      }); 
}

//This API stores the provided private key in the component. It also stores the information in the DB
//input parameters are component, componentBaseUrl, ownerUserName, ownerPassword, keyName

function setupComponentPrivateKey(req, res, next){
  if(req.params.component == "chefcc"){

  console.log("Setup request for ChefCompliance starting...");
    var jsonObject = JSON.stringify({
        "userid" : req.params.ownerUserName,
        "password" : req.params.ownerPassword
    });

    console.log(jsonObject);
    var postheaders = {
        'Content-Type' : 'application/json',
        'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
    };
    // the post options
    var optionspost = {
        host : req.params.componentBaseUrl,
        port : 443,
        path : '/api/login',
        method : 'POST',
        headers : postheaders,
        strictSSL:false,
        rejectUnhauthorized : false
    };

    //console.info('Options prepared:');
    //console.info(optionspost);
    //console.info('Do the POST call');


    // do the POST call
    var reqPost = https.request(optionspost, function(res1) {
        console.log("statusCode: ", res1.statusCode);
        // uncomment it for header details
    //console.log("headers: ", res.headers);

        res1.on('data', function(data) {
            //console.info('POST result:\n');
            //process.stdout.write(data);
            //console.info('\n\nPOST completed');
    var AUTH='Bearer '+data;
    //console.log(AUTH);


  r.db('key').table('keys').filter({baseKeyName:req.params.keyName,username:req.params.ownerUserName })
  .orderBy(r.desc("timestamp"))
  .pluck('privateKeyValue').run(connection, function(err, cursor) {
    if(err) {
      send(500,"Error fetching the key from DB");
      return next(err);
    }

    cursor.toArray(function(err, result) {
      if(err) {
        send(500,"Error fetching the key from DB");
        return next(err);
      }
      console.log("Result:  \n"+result[0].privateKeyValue);



      var jsonObjectKey = JSON.stringify({
                        "name" : req.params.keyName+'_private',
                        "private" : result[0].privateKeyValue
                    });
console.log("here???");
      var postheadersKey = {
                'Content-Type' : 'application/json',
                'Content-Length' : Buffer.byteLength(jsonObjectKey, 'utf8'),
                'Authorization': AUTH
            };


      var optionspostKey = {
                host : req.params.componentBaseUrl,
                port : 443,
                path : '/api/owners/'+req.params.ownerUserName+'/keys',
                method : 'POST',
                headers : postheadersKey,
                strictSSL:false,
                rejectUnhauthorized : false
            };

      
            var reqPostKey = https.request(optionspostKey, function(res2) {
                console.log("statusCode: ", res2.statusCode);
                // uncomment it for header details
            //console.log("headers: ", res.headers);

                res2.on('data', function(d) {
                    console.info('POST result from api call to save they key:\n');
                    process.stdout.write(d);
                    console.info('\n\nPOST completed');
                    res.send(200);
                    return next();
                });
            });

            // write the json data
            reqPostKey.write(jsonObjectKey);
            reqPostKey.end();
            reqPostKey.on('error', function(e) {
              console.error(e);
              res.send(400);
              return next();
                
            });
            

      
    });

  });

            

            

            




        });
    });

    // write the json data
    reqPost.write(jsonObject);
    reqPost.end();
    reqPost.on('error', function(e) {
      console.log("in here:errro???");
        console.error(e);
        res.send(400);
        return next();

    });

  }
  else{
  console.log("No other component is currently supported");
  res.send(400);
  return next();

  }

}

 server.get('/key/:keyName', getKey);
 server.post('/key', postKey);
 server.post('/keys/keypair',generateKeyPair);
 server.post('/keys/:component/keypairs', setupComponentPrivateKey);
 

 server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
}
);