'use strict';


angular.module('core').controller('HomeController', ['$scope', 'Authentication', 'Replay',
	function($scope, Authentication, Replay) {
		// This provides Authentication context.
		$scope.authentication = Authentication;

		Replay.load('replays/55541a842e8eb4f317de9e68.zip').then(function(script){
			$scope.script = script;
			$scope.round = 0;
			$scope.activeReplay = script;
		});

	}
]);
