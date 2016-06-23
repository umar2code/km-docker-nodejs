
var restify = require('restify');
var server = restify.createServer();
var keyName;
var keyValue;


server.use(restify.bodyParser());
server.use(restify.requestLogger());

function respond(req, res, next) {
  res.send('hello ' + req.params.keyName);
  next();
}


function send(req, res, next) {
   res.send('hello ' + req.params.name);
   return next();
 }

 server.post('/key', function create(req, res, next) {
     keyName = req.params.keyName;
     keyValue = req.params.keyValue;
     console.log("Value of Keys is "+keyName+"   "+keyValue);

   res.send(201, Math.random().toString(36).substr(3, 8));
   return next();
 });
 server.get('/key/:keyName', respond);

 server.listen(8080, function() {
  console.log('%s listening at %s', server.name, server.url);
});