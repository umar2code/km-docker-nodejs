
//setup all required modules
var restify = require('restify');
var r = require('rethinkdb');
var https = require('https');
var keypair = require('keypair');
var forge = require('node-forge');
var async = require('async');

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
server.use(restify.queryParser());
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
  console.log("Parameters:",req.params);
     var keyName = req.params.keyName;
     var keyValue = req.params.keyValue;
     //keyValue = new Buffer(req.params.keyValue).toString('base64');
     console.log("Value of Key in rethinkdb is   "+JSON.stringify(keyValue));
  r.db('key').table('keys').insert([
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

  //BUGFIX:if a key already exists with a key name a new one should not be generated.


      r.table('keys').insert([
            { 
              username: req.params.username,
              password: req.params.password,
              baseKeyName: keyName,
              publicKeyName: keyName+'_public',
              privateKeyName: keyName+'_private',
              publicKeyValue: publicKeySSH,
              privateKeyValue: pair.private,
              component: req.params.component,
              timestamp: new Date()
            }
        ]).run(connection, function(err, result) {
            if (err) throw err;
            console.log(JSON.stringify(result, null, 2));
            res.send(200, pair.private);
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
  //NEED TO ADD PASASWORD BACK IN THE TABLE

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




// The get method retrieves the RSA Keys based on the keyname and adminusername provided for the component. By Default only public key is returned.So only username needs to be passed. 
function getpublicKey(req, res, next){
    //
  r.db('key').table('keys').filter({baseKeyName:req.params.keyname,username:req.params.username })
        .orderBy(r.desc("timestamp"))
        .pluck('publicKeyValue').run(connection, function(err, cursor) {
          if(err) {
            res.send(500,"Error fetching the key from DB");
            return next(err);
          }

          cursor.toArray(function(err, result) {
            if(err) {
              res.send(500,"Error fetching the key from DB");
              return next(err);
            }
            console.log("Result:  \n"+JSON.stringify(result[0].publicKeyValue));
            res.send(result[0].publicKeyValue);
            return next();

          });



  });

}


//Bootstrap a compliance to the chef compliance sever
/* Input Params
    * component: chefcc
    * environment
    * componentBaseUrl
    * nodename
    * hostname
    * VMusername : so that compliance can ssh user this name
    * complianceusername: user name of admin on compliance server who can add this
    * passphrase
    * keyName

 */
/* Description: This is used to bootstrap a node to chef compliance server
  * TODO:check if deployment passphrase is accurate
  * this is specific to chefcc - so check if component is chefcc
  * Check if the environment first needs to be created. If it exists do not create it as it will create duplicate
  * add a node to chef server using info provided(chefcc api - /api/owners/USER/envs) 
  * IF successful respond back with the publick key
*/
function bootstrapComplianceNode(req, res, next){
    var chefcc_flag=false;

  async.auto({
      check_component_name_chefcc: function(callback) {
          console.log('in check_component_name_chefcc');
          // to check if component name is chefcc
          if(req.params.component == "chefcc")
          {
            console.log("valid component name received "+req.params.component);
          callback(null,"Valid Component Name");
          }
          else{
            console.log("Not a valid component name");
            callback(err);          
          }
      },
      get_complianceadmin_password: ['check_component_name_chefcc', function(results, callback) {
          console.log('in get_complianceadmin_password', results);
          // Get compliance admin password from the DB

          r.db('key').table('keys').filter({baseKeyName:req.params.keyName,username:req.params.username,component:req.params.component })
          .orderBy(r.desc("timestamp"))
          .pluck('password').run(connection, function(error, cursor) {
            if(error) {
              console.log("Inside error for DB");
              callback(err,'Internal Server Error: Cannot connect to DB to fetch authentication info');
            }

            cursor.toArray(function(err, result) {
              if(err) {
              callback(err,'Internal Server Error: Cannot fetch authentication info');
              }
              else{
              console.log("Result:  \n"+JSON.stringify(result[0].password));
              callback(null,result[0].password);
              }

            });

          });
      }],
      get_complianceadmin_apitoken: ['get_complianceadmin_password', function(results, callback) {
          console.log('in get_complianceadmin_apitoken', JSON.stringify(results));
          // For any API calls to compliance server, a API token is needed.
        var reqparams = {
          complianceOwnerUserName: req.params.username,
          complianceOwnerPassword: results.get_complianceadmin_password,
          componentBaseUrl: req.params.componentBaseUrl
        };

        getAPIToken(reqparams, function(err, apiToken)
        {
          if(err){
            console.log("Cannot retrieve the api token from the server:"+err);
            callback(err);

          }
          else{
              console.log("Successfull retrieved API Token: "+apiToken);
              callback(null,apiToken);
          }
        });

      }],
    check_ifenvExists: ['get_complianceadmin_apitoken', function(results, callback){
          console.log('in check_ifenvExists', JSON.stringify(results)); 
          var reqparams = {
            body: {},
            metadata: {
                  componentBaseUrl: req.params.componentBaseUrl,
                  method: "GET",
                  apiToken: results.get_complianceadmin_apitoken,
                  path: '/api/owners/'+req.params.username+'/envs/'+req.params.env
            }
          };
            console.log("reqparams in check_ifenvexists "+JSON.stringify(reqparams));
          chefComplianceAPIAdaptor(reqparams,function(err,data,responseCode){

              console.log("Response code from GetENVs: "+responseCode);

              if(responseCode == "200"){
                console.log("No need to create new environemt. It already exists");
                // no need to create a new environemt. Send the env Name to next task
                callback(null,req.params.env);


              }

              if(responseCode == "403"){
            //this means that ENV is not yet created in the Compliance
            //First the environment has to be created
            reqparams = {
              body: {
                    name: req.params.env
              },
              metadata: {
                    componentBaseUrl: req.params.componentBaseUrl,
                    method: "POST",
                    apiToken: results.get_complianceadmin_apitoken,
                    path: '/api/owners/'+req.params.username+'/envs'
              }
            };
              chefComplianceAPIAdaptor(reqparams,function(err,data,responseCode){

                console.log("Response code to create an env: "+responseCode);
                if(responseCode == "200") callback(null,req.params.env);
                else callback(err);

            });

          }
          });
    }],

    bootstrap_node_compliance: ['check_ifenvExists', function(results, callback){
          console.log('in bootstrap_node_compliance', JSON.stringify(results)); 
          var reqparams;

            reqparams = {
              body: {
                    name: req.params.nodename,
                    hostname: req.params.hostname,
                    loginUser: req.params.vmUserName,
                    loginMethod: "ssh",
                    loginKey: req.params.username+'/'+req.params.keyName+'_private',
                    loginPort: 22
              },
              metadata: {
                    componentBaseUrl: req.params.componentBaseUrl,
                    method: "POST",
                    apiToken: results.get_complianceadmin_apitoken,
                    path: '/api/owners/'+req.params.username+'/envs/'+req.params.env+'/nodes'
              }
            };
              console.log("reqparams in bootstrap_node_compliance "+JSON.stringify(reqparams));
            chefComplianceAPIAdaptor(reqparams,function(err,data,responseCode){

                console.log("Response code from bootstrap: "+responseCode);
                if(responseCode == "200"){
                r.db('key').table('keys').filter({baseKeyName:req.params.keyName,username:req.params.username })
                  .orderBy(r.desc("timestamp"))
                  .pluck('publicKeyValue').run(connection, function(err, cursor) {
              if(err) {
                callback(err);
              }

              cursor.toArray(function(err, result) {
                if(err) {
                  callback(err);
                }
                console.log("Result:  \n"+JSON.stringify(result[0].publicKeyValue));
                callback(null,result[0].publicKeyValue);
                console.log('here1');
              });
                
                console.log('here2');
                

                });
                                console.log('here3');

                  
                }

                console.log('here4');

            });
                          console.log('here5');

    }]

  }, function(err, results) {
                    console.log('here6');

    if(err){
      console.log('err = ', err);
      res.send(400,err);
      return next();
    }
    else{
      console.log('results in the final callback= ', JSON.stringify(results.get_complianceadmin_apitoken));
      res.send(200,results.bootstrap_node_compliance);
      return next();

    }
  });

 }

server.get('/key/:keyName', getKey);
server.post('/key', postKey);
server.post('/keys/:component/:username/keypairs',generateKeyPair);
server.post('/keys/:component/:username/component', setupComponentPrivateKey);
server.get('/keys/:component/:username/keypairs/:keyname', getpublicKey);
server.post('/keys/:component/:username/envs/:env/nodes', bootstrapComplianceNode);



//this is a function to get an API token for Chef Compliance Server Calls
//if there are errors then the call back show errors

function getAPIToken(reqparams,callback){

  console.log("Inside request to get API token...");
          var jsonObject = JSON.stringify({
              "userid" : reqparams.complianceOwnerUserName,
              "password" : reqparams.complianceOwnerPassword
          });

          console.log(jsonObject);
          var postheaders = {
              'Content-Type' : 'application/json',
              'Content-Length' : Buffer.byteLength(jsonObject, 'utf8')
          };
          // the post options
          var optionspost = {
              host : reqparams.componentBaseUrl,
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
                  process.stdout.write(data);
                  console.info('\n\nPOST completed');
          callback(null,data.toString('utf8'));

              });

          });
          //console.log(AUTH);
          reqPost.write(jsonObject);
          reqPost.end();
          reqPost.on('error', function(e) {
            console.log("in here:errro???");
              console.error(e);
              callback(e);
          });
}


function chefComplianceAPIAdaptor(reqparams,fncallback){

  console.log("Inside request for chefcomplianceAdaptor...");
        var jsonObject = JSON.stringify(reqparams.body);

        console.log(jsonObject);
        //console.log("Metadata received:"+JSON.stringify(reqparams.metadata.path));
        var postheaders = {
            'Content-Type' : 'application/json',
            'Content-Length' : Buffer.byteLength(jsonObject, 'utf8'),
            'Authorization' : 'Bearer '+reqparams.metadata.apiToken
        };
        // the post options
        var optionsMethod = {
            host : reqparams.metadata.componentBaseUrl,
            port : 443,
            path : reqparams.metadata.path,
            method : reqparams.metadata.method,
            headers : postheaders,
            strictSSL:false,
            rejectUnhauthorized : false
        };

        console.info('Options prepared:');
        console.info(optionsMethod);
        //console.info('Do the POST call');


        // do the POST or GET call
        var reqMethod = https.request(optionsMethod, function(res1) {
            console.log("statusCode: ", res1.statusCode);
            // uncomment it for header details
        //console.log("headers: ", res.headers);
        if(res1.statusCode == "403" || res1.statusCode == "500" ){

          fncallback(null,"",res1.statusCode);

        }
            res1.on('data', function(data) {
                //console.info('POST result:\n');
                process.stdout.write(data);
                console.info('\n\nPOST or GET completed');
        fncallback(null,data.toString('utf8'),res1.statusCode);

            });

        });
        //console.log(AUTH);
          reqMethod.write(jsonObject);

        reqMethod.end();
        reqMethod.on('error', function(e) {
          console.log("in here:errro???");
            console.error(e);
            fncallback(e);
        });
}


 server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
}
);