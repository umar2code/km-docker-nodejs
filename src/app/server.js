
var restify = require('restify');
var server = restify.createServer();
var r = require('rethinkdb');
var config = require('./config');
var databaseController = require('./controllers/databaseController');
var keyName;
var keyValue;
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
                })
        }
    });

server.use(restify.bodyParser());
server.use(restify.requestLogger());

//this function is for the get operation.

function respond(req, res, next) {
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
};
  //this is for post operation, keyName and keyValue have to be specified in the body. 
server.post('/key', function create(req, res, next) {
     keyName = req.params.keyName;
     //keyValue = req.params.keyValue;
     keyValue = req.params.keyValue;
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
 });


 server.get('/key/:keyName', respond);

 server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
}
);