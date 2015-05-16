'use strict';

angular.module('core').factory('Replay', ['$q', function($q){
  var service = {};

  function pad(num, size){
    var s = '00000' + num;
    return s.substr(s.length-size);
  }

  function getMove(file){
    var tokens = file.asText().split(' ');
    return tokens[2];
  }

  function findOtherEntity(entity, entityList){
    for(var id in entityList){
      if(entityList.hasOwnProperty(id)){
        if(id == entity.id) continue;
        var o = entityList[id];
        if(o.x == entity.x && o.y == entity.y){
          return o;
        }
      }
    }
    return null;
  }

  function convertEntity(entity){
    return {
      id: entity.Id,
      x: entity.X,
      y: entity.Y,
      player: entity.PlayerNumber,
      type: entity.Type
    };
  }

  function addEvent(script, event, entities){
    var newEntities = [];
    for(var len = entities.length, i = 0; i < len; ++i){
      var e = entities[i];
      newEntities.push({
        id: e.id,
        x: e.x,
        y: e.y,
        player: e.player,
        type: e.type
      });
    }
    script.push({
      event: event,
      entities: newEntities
    });
  }

  service.load = function(url){
    var deferred = $q.defer();
    JSZipUtils.getBinaryContent(url, function(err, data) {
      if(err) {
        throw err;
      }
      var zip = new JSZip(data);

      var infoFile = zip.file('matchinfo.json');
      if(infoFile)
      {
        var script = [];
        var matchInfo = JSON.parse(infoFile.asText());
        var rounds = matchInfo.Rounds;
        var preState = null;
        var preEntities = {};
        for (var i = 0; i <= rounds; ++i){

          // Load files
          var roundScript = [];
          var roundFolder = pad(i, 3) + '/';
          var move1File = zip.file(roundFolder + 'move1.txt');
          var move2File = zip.file(roundFolder + 'move2.txt');
          var stateFile = zip.file(roundFolder + 'state.json');

          var moves = [getMove(move1File), getMove(move2File)];
          var state = JSON.parse(stateFile.asText());

          var map = state.Map;
          var rows = map.Rows;
          var width = map.Width - 1;
          var height = map.Height - 1;

          var entities = {};
          for(var row = 1; row < height; ++row){
            var rowEntities = rows[row];
            for(var col = 1; col < width; ++col){
              var element = rowEntities[col];
              if(element == null){
                continue;
              }
              if(!element.Alive){
                continue;
              }
              var type = element.Type;
              if(type == 'Ship' || type == 'AlienFactory' || type == 'MissileController'){
                continue;
              }
              var entity = convertEntity(element);
              entities[entity.id] = entity;

              if(entity.id in preEntities){
                addEvent(roundScript, 'move', [entity]);
                delete preEntities[entity.id];
              }
              else{
                addEvent(roundScript, 'spawn', [entity]);
              }
            }
          }

          if(preState){
            var alienShoot = [false, false];
            var aliensMoveForward = [false, false];
            for(var p = 0; p < 2; ++p){
              var player = state.Players[p];
              var prePlayer = preState.Players[p];
              if(player.AlienManager.ShotEnergy < prePlayer.AlienManager.ShotEnergy){
                alienShoot[p] = true;
              }
              if(player.AlienManager.DeltaX !== prePlayer.AlienManager.DeltaX){
                aliensMoveForward[p] = true;
              }
            }


            // First update missiles & bullets
            for(var id in preEntities){
              if(preEntities.hasOwnProperty(id)){
                var killedEntity = preEntities[id];
                if(killedEntity.type == 'Missile' || killedEntity.type == 'Bullet'){
                  if(killedEntity.player == 1){
                    --killedEntity.y;
                  }else{
                    ++killedEntity.y;
                  }
                  if(killedEntity.y <= 0 || killedEntity.y >= height){
                    addEvent(roundScript, 'entityOffField', [killedEntity]);
                    delete preEntities[id];
                    continue;
                  }

                  var otherEntity = findOtherEntity(killedEntity, preEntities);
                  if(otherEntity !== null){
                    addEvent(roundScript, 'collision', [killedEntity, otherEntity]);
                    delete preEntities[otherEntity.id];
                    delete preEntities[id];
                    continue;
                  }
                }
              }
            }

            for(var id in preEntities){
              if(preEntities.hasOwnProperty(id)){
                var killedEntity = preEntities[id];
                if(killedEntity.type == 'Alien')
                {
                  // Move alien
                  if(killedEntity.player == 1)
                  {
                    if(aliensMoveForward[0]){
                      --killedEntity.y;
                    }
                    else{
                      killedEntity.x += state.Players[0].AlienManager.DeltaX;
                    }
                  }
                  else
                  {
                    if(aliensMoveForward[1]){
                      ++killedEntity.y;
                    }
                    else{
                      killedEntity.x += state.Players[1].AlienManager.DeltaX;
                    }
                  }

                  if(killedEntity.y <= 0 || killedEntity.y >= height){
                    addEvent(roundScript, 'homeWallCollision', [killedEntity]);
                    delete preEntities[id];
                    continue;
                  }

                  var otherEntity = findOtherEntity(killedEntity, preEntities);
                  if(otherEntity !== null){
                    if(otherEntity.type == 'Shield'){
                      addEvent(roundScript, 'explosion', [otherEntity]);
                    }
                    addEvent(roundScript, 'collision', [killedEntity, otherEntity]);
                    delete preEntities[otherEntity.id];
                    delete preEntities[id];
                    continue;
                  }
                }
              }

            }

            for(var id in preEntities){
              if(preEntities.hasOwnProperty(id)){
                var killedEntity = preEntities[id];
                var other = preState.Map.Rows[killedEntity.y][killedEntity.x];
                if(other !== null){
                  switch(other.type)
                  {
                    case 'Ship':
                    case 'MissileController':
                    case 'AlienFactory':
                    addEvent(roundScript, 'collision', [killedEntity, convertEntity(other)]);
                    delete preEntities[id];
                    continue;
                  }
                }
              }
            }

            for(var p = 0; p < 2; ++p){
              var ship = state.Players[p].Ship;
              var preShip = preState.Players[p].Ship;
              if(ship == null && preShip !== null){
                var move = moves[p];
                var dx = 0;
                if(move == 'MoveLeft'){
                  if(p == 0){
                    dx = -1;
                  }else{
                    dx = 1;
                  }
                }
                else if (move == 'MoveRight'){
                  if(p == 0){
                    dx = 1;
                  }else{
                    dx = -1;
                  }
                }else{
                  continue;
                }
                var x = preShip.X + dx;
                for(var id in preEntities){
                  if(preEntities.hasOwnProperty(id)){
                    var killedEntity = preEntities[id];
                    if(killedEntity.y == preShip.Y){
                      if(killedEntity.x >= x && killedEntity.x < (x+3)){
                        preShip.X = x;
                        addEvent(roundScript, 'collision', [killedEntity, convertEntity(preShip)]);
                        delete preEntities[id];
                        continue;
                      }
                    }
                  }
                }
              }
            }

            for(var p = 0; p < 2; ++p){
              var ship = state.Players[p].Ship;
              if(ship !== null){
                var move = moves[p];
                if(move == 'Shoot' && (state.Players[p].Missiles.length < state.Players[p].MissileLimit))
                {
                  var x = ship.X + 1;
                  var y = ship.Y;
                  if(p == 0){
                    --y;
                  }
                  else{
                    ++y;
                  }
                  var missile = state.Map.Rows[y][x];

                  if(missile == null){
                    var missileEntity = {id: -(p+1), x: x, y: y, type: 'Missile'};
                    addEvent(roundScript, 'spawn', [missileEntity]);
                    var foundEntity = false;
                    for(var id in preEntities){
                      if(preEntities.hasOwnProperty(id)){
                        var killedEntity = preEntities[id];
                        if(killedEntity.y == y && killedEntity.x == x){
                          addEvent(roundScript, 'collision', [killedEntity, missileEntity]);
                          delete preEntities[id];
                          foundEntity = true;
                          break;
                        }
                      }

                      if(!foundEntity){
                        var bulletEntity = {id: -(p+3), x: x, y: y, type: 'Bullet'};
                        addEvent(roundScript, 'spawn', [bulletEntity]);
                        addEvent(roundScript, 'collision', [bulletEntity, missileEntity]);

                      }
                    }
                  }

                }
              }
            }

            for(var id in preEntities){
              if(preEntities.hasOwnProperty(id)){
                var killedEntity = preEntities[id];
                addEvent(roundScript, 'destroyed', [killedEntity]);
              }
            }

            for(var p = 0; p < 2; ++p){
              var ship = state.Players[p].Ship;
              var alienFactory = state.Players[p].AlienFactory;
              var missileController = state.Players[p].MissileController;

              var preShip = preState.Players[p].Ship;
              var preAlienFactory = preState.Players[p].AlienFactory;
              var preMissileController = preState.Players[p].MissileController;

              if(ship !== null){
                if(preShip == null){
                  addEvent(roundScript, 'spawn', [convertEntity(ship)]);
                }else{
                  addEvent(roundScript, 'move', [convertEntity(ship)]);
                }
              }
              if(alienFactory !== null && preAlienFactory == null){
                addEvent(roundScript, 'spawn', [convertEntity(alienFactory)]);
              }
              if(missileController !== null && preMissileController == null){
                addEvent(roundScript, 'spawn', [convertEntity(missileController)]);
              }
            }

          }
          else{
            for(var p = 0; p < 2; ++p){
              var ship = state.Players[p].Ship;
              addEvent(roundScript, 'spawn', [convertEntity(ship)]);
            }
          }

          preState = state;
          preEntities = entities;

          script.push(roundScript);

        }
      }

      deferred.resolve(script);

    });

    return deferred.promise;
  }

  return service;
}]);
