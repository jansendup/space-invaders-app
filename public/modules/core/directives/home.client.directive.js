'use strict';

angular.module('core').directive('myReplay', ['$interval', function($interval) {
  return {
    restrict: 'A',
    replace : true,
    scope :{myReplay: '=', round: '='},
    link: function (scope, element, attrs){
      var stage;
      var timeoutId;

      var entities = {};

      function createEntity(e){
        var shape = new createjs.Shape();
        var color;
        var width = 10;
        var x = 0;
        switch(e.type){
          case 'Alien':
            color = '#FF0000';
            break;
          case 'Bullet':
            color = '#FF0000';
            width = 3;
            x = (10 - width)/2;
            break;
          case 'Missile':
            color = '#0000FF';
            width = 3;
            x = (10 - width)/2;
            break;
          case 'Ship':
            color = '#000000';
            width = 30;
            break;
          case 'MissileController':
            color = '#00FF00';
            width = 30;
            break;
          case 'AlienFactory':
            color = '#FF00FF';
            width = 30;
            break;
          case 'Shield':
            color = '#FFFF00';
            break;
        }
        shape.graphics.beginFill(color).drawRect(x, 0, width, 10);
        shape.x = e.x*10;
        shape.y = e.y*10;
        return {id: e.id, type: e.type, shape: shape};
      }

      scope.$watch('myReplay', function(){
        stage = new createjs.Stage(element[0]);
        scope.round = -1;
        if(timeoutId) $interval.cancel(timeoutId);
        timeoutId = $interval(function() {
          update(); // update DOM
        }, 1000);


      });

      function update(){
        if(scope.round >= (scope.myReplay.length-1)){
          $interval.cancel(timeoutId);
          return;
        }
        for(var len = scope.myReplay[scope.round+1].length, i = 0; i < len; ++i){
          var event = scope.myReplay[scope.round+1][i];
          switch(event.event){
            case 'spawn':
              var entity = createEntity(event.entities[0]);
              entities[entity.id] = entity;
              stage.addChild(entity.shape);
            break;
            case 'move':
              var entity = entities[event.entities[0].id];
              entity.shape.x = 10*event.entities[0].x;
              entity.shape.y = 10*event.entities[0].y;
            break;
            case 'collision':
              var e1 = entities[event.entities[0].id];
              var e2 = entities[event.entities[1].id];
              stage.removeChild(e1.shape);
              stage.removeChild(e2.shape);
              delete entities[event.entities[0].id];
              delete entities[event.entities[1].id];
            break;
            case 'entityOffField':
              var e = entities[event.entities[0].id];
              stage.removeChild(e.shape);
              delete entities[event.entities[0].id];
            break;
            case 'destroyed':
              console.log(event.entities[0]);
              var e = entities[event.entities[0].id];
              stage.removeChild(e.shape);
              delete entities[event.entities[0].id];
            break;
          }
        }
        scope.round++;

        stage.update();
      }


    }
  };
}]);
