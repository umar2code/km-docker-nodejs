
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
                    return databaseController.createTable(conn, 'key');
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


  r.db('key').table('key').filter({keyName:requestName}).orderBy(r.desc("timestamp")).pluck('keyValue').run(connection, function(err, cursor) {
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
r.table('key').insert([
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
//input email and username

function generateKeyPair(req, res, next){

var comment = req.params.email;
var userName = req.params.username;
var pair = keypair();
var publicKey = forge.pki.publicKeyFromPem(pair.public);
var publicKeySSH = forge.ssh.publicKeyToOpenSSH(publicKey, comment);

//console.log(publicKeySSH);

var response = {"publicKey": publicKeySSH,
                "privateKey":pair.private };
res.send(200, response);
return next();


}


 server.get('/key/:keyName', getKey);
 server.post('/key', postKey);
 server.post('/securekeys/keypair',generateKeyPair);

 server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
}
);