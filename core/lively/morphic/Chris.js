module('lively.morphic.Chris').requires().toRun(function() {
    lively.morphic.Morph.subclass('lively.morphic.labbook', 'events', {
        initialize: function($super){
            $super();
        },
        login: function(email, password){
            alert(email); 
            alert(password);
            $morph('Rectangle1').applyStyle({ opacity: .20});
        }
    });    

}) // end of module