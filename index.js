console.log("Booting server...")
var request = require('request');
var server = require('http').createServer();
var npkey=process.env['npkey']
var PlayFab = require("./PlayFab/PlayFab.js");
var PlayFabServer = require("./PlayFab/PlayFabServer.js");
PlayFab.settings.titleId = "69A78";
const serverkey = process.env['authkey'];

PlayFab.settings.developerSecretKey=serverkey;
var options = {
  cors: true
}
var io = require('socket.io')(server, options);
var players = {};
function generatedamage(min,max){
  return parseInt(Math.random()*(max-min)+min); 
}
function Player (id,username,pskin) {
    this.id = id;
    this.username=username;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.entity = null;
    this.health=100;
    this.skin=pskin
}

io.sockets.on('connection', function(socket) {
    socket.on('getplayers',function(){
      var playe=Object.keys(players).length
      socket.emit('playerstotal',playe)
    });
    socket.on('getaval',function(){
      var options = {
        'method': 'GET',
        'url': 'https://api.nowpayments.io/v1/merchant/coins',
        'headers': {
          'x-api-key': npkey
        }
      };
      request(options, function (error, response) {
        if (error) throw new Error(error);
          socket.emit('aval',JSON.parse(response.body));
      });
    });
    socket.on('purchase',function(data){
          var options = {
      'method': 'POST',
      'url': 'https://api.nowpayments.io/v1/payment',
      'headers': {
        'x-api-key': npkey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "price_amount": data.amount/1000,
        "price_currency": "usd",
        "pay_currency": data.curr,
        "ipn_callback_url": "https://randomstuff.ml",
        "order_id": "RTRECHARGE",
        "order_description": `${data.amount} RT`
      })
    };
    request(options, function (error, response) {
      if (error) throw new Error(error);
        socket.emit('paymentrequest',JSON.parse(response.body));
    });
    });
  socket.on('getorder',function(data){
    var options = {
      'method': 'GET',
      'url': `https://api.nowpayments.io/v1/payment/${data.orderid}`,
      'headers': {
        'x-api-key': npkey
      }
    };
    request(options, function (error, response) {
      if (error) throw new Error(error);
      var orderdata=JSON.parse(response.body);
      if(orderdata.payment_status=="confirmed"){
        PlayFabServer.AddUserVirtualCurrency({"PlayFabId":data.playerid,"Amount":(orderdata.price_amount*1000),"VirtualCurrency":"RT"},function(error,response){
          if(error){
            console.log(error)
          }
        });
      }
      socket.emit('orderdetails',JSON.parse(response.body));
    });
  });
    socket.on ('initialize', function (data) {
        var id = socket.id;
        var username = data.username.toLowerCase();
        var pskin = data.playerskin;
        
        var newPlayer = new Player (id,username,pskin);
        // Creates a new player object with a unique ID number.
        players[id] = newPlayer;
        // Adds the newly created player to the array.
      setInterval(function(){
                socket.emit('updatestats');
      }.bind(socket),30000)
              socket.emit('updatestats');
        if(username!=''){
        socket.emit ('playerData', {id: id, players: players,username:username,skin:pskin});
        // Sends the connecting client his unique ID, and data about the other players already connected.
        socket.broadcast.emit ('playerJoined', newPlayer);
        // Sends everyone except the connecting player data about the new player.
        }
        socket.on ('initialize', function (username) {
            var id = socket.id;
            var newPlayer = new Player (id);
            players[id] = newPlayer;
            if(username!=''){
            socket.emit ('playerData', {id: id, players: players,username:username,skin:pskin});
            socket.broadcast.emit ('playerJoined', newPlayer);
            }
        });
        socket.on('playershooting',function(data){
          console.log(data)
          socket.broadcast.emit('playerisshooting',data);
        });
        socket.on ('positionUpdate', function (data) {
                if(!players[data.id]) return;
                players[data.id].x = data.x;
                players[data.id].y = data.y;
                players[data.id].z = data.z;

            socket.broadcast.emit ('playerMoved', data);
        });
        socket.on('playerdamaged',function(data){
          var damage = generatedamage(10,20);
          var parsedid=data.enemyid.split('=')[1]
          var enemyhealth=players[parsedid].health;
          players[parsedid].health=enemyhealth-damage;
          if(damage>=players[parsedid].health){
            socket.emit('updatestats');
            socket.emit('playerkilled',{"playerkilled":players[parsedid].username,"killedby":data.player,"killedid":parsedid});
            socket.broadcast.emit('playerkilled',{"playerkilled":players[parsedid].username,"killedby":data.player,"killedid":parsedid});
            players[parsedid].health=100;
            players[parsedid].x = 0;
            players[parsedid].y = 3;
            players[parsedid].z = 0;
            var id=data.playfabid
            PlayFabServer.AddUserVirtualCurrency({"PlayFabId":data.playfabid,"Amount":generatedamage(3,7)*2,"VirtualCurrency":"RT"},function(error,response){
              if(error){
                console.log(error)
              }
            });
            PlayFabServer.GetPlayerStatistics({"PlayFabId":data.playfabid,"StatisticNames":['xp','kills','level']},function(error,response){
              if(error){
                console.log(error)
              }else{
                var data = response.data;
                var stats=data.Statistics;
                var xp=0
                var kills=0
                var level=0
                for(var stat of stats){
                  if(stat.StatisticName=='xp'){
                    xp=parseInt(stat.Value);
                  }else if(stat.StatisticName=="kills"){
                    kills=parseInt(stat.Value);
                  }else if(stat.StatisticName=='level'){
                    level=parseInt(stat.Value);
                  }
                }
                  kills += 1;
                  xp += generatedamage(1,10);
                  if(xp>=(level*(4*4)*9)){
                    level+=1
                  }
                  var updatecallback=function(error,response){
                    if(error){
                      console.log(error)
                    }
                  }
                  var data = {"PlayFabId":id,"Statistics":[{"StatisticName":"xp","Value":xp},{"StatisticName":"kills","Value":kills},{"StatisticName":"level","Value":level}]};
                  PlayFabServer.UpdatePlayerStatistics(data,updatecallback)
              }
            });
          }else{
          socket.emit('updatedamagedplayer',{"damaged":players[parsedid].username,"updatedhealth":players[parsedid].health,"enemyid":data.enemyid});
          socket.broadcast.emit('updatedamagedplayer',{"damaged":players[parsedid].username,"updatedhealth":players[parsedid].health,"enemyid":data.enemyid});
          }
        });
        socket.on('buyskincrate',function(data){
          let pdata=data
            PlayFabServer.GetUserInventory({"PlayFabId":data.playfabid},function(error,response){
              if(error){
                console.log(error)
              }else{
                let idata=response.data
                let playerrtbalance=idata.VirtualCurrency.RT;
                if(playerrtbalance>=data.cratecost){
                PlayFabServer.SubtractUserVirtualCurrency({"Amount":data.cratecost,"PlayFabId":data.playfabid,"VirtualCurrency":"RT"},function(error,response){
                  if(error){
                    console.log(error)
                  }
                });
                var body={"TableId":data.skincrate};
                var callback=function(error,response){
                  if(error){
                    console.log(error)
                  }else{
                    var data = response.data;
                    var item=data.ResultItemId;
                    var addbody={"ItemIds":[item],"PlayFabId":pdata.playfabid,"Annotation":"Received via skin crate"};
                    PlayFabServer.GrantItemsToUser(addbody,function(error,response){
                      if(error){
                        console.log(error)
                      }else{
                        var data= response.data;
                        var itemssent=data.ItemGrantResults;
                        var itemsent=itemssent[0].DisplayName;
                        socket.emit('purchaseresult',{"result":`You received ${itemsent}`})
                      }
                    }.bind(socket));
                  }
                }.bind(socket)
                PlayFabServer.EvaluateRandomResultTable(body,callback);
              }else{
                  socket.emit('purchaseresult',{"result":"Not Enough Random Tokens"});
              }
                socket.emit('updatestats');
              }
            });
        });
        socket.on('disconnect',function(){
            if(!players[socket.id]) return;
            delete players[socket.id];
            // Update clients with the new player killed 
            socket.broadcast.emit('killPlayer',socket.id);
        });
    });
});

console.log ('Server started');
server.listen(3000);