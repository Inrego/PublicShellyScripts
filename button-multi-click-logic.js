// Advanced multi-click handling. Heavily inspired by on_multi_click in ESPHome.
// Note: sequence patterns must end with an action of type "atLeast" (atMost might work, but doesn't logically make sense, and isn't tested).
// When a sequence is completed, an event will be emitted with name "custom_button_sequence", and parameter object like {"name": "double_click", "compoment": "button:0"}
const sequences = [
  { 
    name: "double_click", 
    pattern: [
      { action: "down", type: "atMost", duration: 0.4 }, 
      { action: "up", type: "atMost", duration: 0.6 },
      { action: "down", type: "atMost", duration: 0.4 },
      { action: "up", type: "atLeast", duration: 0.2 }
    ]
  },
  { 
    name: "click_and_hold", 
    pattern: [
      { action: "down", type: "atMost", duration: 0.4 }, 
      { action: "up", type: "atMost", duration: 0.6 },
      { action: "down", type: "atLeast", duration: 0.4 }
    ]
  },
  { 
    name: "hold", 
    pattern: [
      { action: "down", type: "atLeast", duration: 0.4 }
    ]
  },
  { 
    name: "click", 
    pattern: [
      { action: "down", type: "atMost", duration: 0.4 },
      { action: "up", type: "atLeast", duration: 0.6 }
    ]
  }
];

// Create a handler state object
function createHandler(sequences, component) {
  var handler = {
    component: component,
    sequences: sequences.map(function(seq) {
      return {
        name: seq.name,
        pattern: seq.pattern,
        events: [],
        canMatch: true,
        timerHandle: null,
        isMatch: function(e) {
          if (this.timerHandle != null) {
            Timer.clear(this.timerHandle);
            this.timerHandle = null;
            this.canMatch = false;
            return false;
          }
          if (!this.canMatch) {
            return false;
          }
          this.events.push(e);
          if (this.events.length > this.pattern.length) {
            this.canMatch = false;
            return false;
          }
          var matchEvent = this.pattern[this.events.length - 1];
          if (matchEvent.action !== e.action) {
            this.canMatch = false;
            return false;
          }
          
          var lastEvent = this.events.length == this.pattern.length;
          if (lastEvent) {
            this.timerHandle = Timer.set(matchEvent.duration * 1000, false, function(seq) {
              if (!seq.canMatch) {
                return;
              }
              if (seq.checkTimer(e.ts, Date.now(), matchEvent)) {
                seq.onSequenceComplete(seq);
              } else {
                seq.canMatch = false;
              }
            }, this)
          } else if (this.events.length > 1) {
            var ev = this.events[this.events.length - 2];
            matchEvent = this.pattern[this.events.length - 2];
            if (!this.checkTimer(ev.ts, e.ts, matchEvent)) {
              this.canMatch = false;
              return false;
            }
          }
          return null;
        },
        checkTimer: function(fromTime, toTime, timing) {
          var duration = toTime - fromTime;
          if (timing.type === "atLeast") {
            return duration >= timing.duration * 1000;
          } else if (timing.type === "atMost") {
            return duration <= timing.duration * 1000;
          }
          return false;
        },
        reset: function() {
          this.events = [];
          this.canMatch = true;
          if (this.timerHandle != null) {
            Timer.clear(this.timerHandle);
            this.timerHandle = null;
          }
        }
      };
    }),
    sequencesInProgress: null,
    onSequenceComplete: function(sequence) {
      this.reset();
      Shelly.emitEvent("custom_button_sequence", {sequence: sequence.name, component: this.component})
    },
    handleClick: function(e) {
      if (this.sequencesInProgress == null) {
        this.sequencesInProgress = this.sequences.map(function(x) {return x});
      }
      for (var i = this.sequencesInProgress.length - 1; i >= 0; i--) {
        var match = this.sequencesInProgress[i].isMatch(e);
        if (match !== null && match) {
          this.sequencesInProgress[i].reset();
          this.sequencesInProgress.splice(i, 1);
        }
      }
      if (this.sequencesInProgress.length == 0) {
        this.sequencesInProgress = null;
      }
    },
    reset: function() {
      if (this.sequencesInProgress != null) {
        for (var i = 0; i < this.sequencesInProgress.length; i++) {
          this.sequencesInProgress[i].reset();
        }
        this.sequencesInProgress = null;
      }
    }
  };
  for (var i = 0; i < handler.sequences.length; i++) {
    handler.sequences[i].onSequenceComplete = handler.onSequenceComplete;
  }
  return handler;
}

let handlers = {
  "input:0": createHandler(sequences, "input:0"),
  "input:1": createHandler(sequences, "input:1")
}

// Attach to Shelly button events
Shelly.addEventHandler(function(e) {
  if (e.component) {
    var handler = handlers[e.component];
    if (handler) {
      var action;
      if (e.info.event === "btn_down") {
        action = "down";
      } else if (e.info.event === "bwn_up") {
        action = "up"
      } else {
        return;
      }
      handler.handleClick({
        action: action,
        ts: e.ts
      })
    }
  }
});

function test() {
  var handler = handlers["input:0"];
  handler.handleClick({
    action: "down",
    ts: Date.now()
  });
  Timer.set(200, false, function() {
    handler.handleClick({
      action: "up",
      ts: Date.now()
    });
    Timer.set(200, false, function() {
      handler.handleClick({
        action: "down",
        ts: Date.now()
      });
      Timer.set(200, false, function() {
        handler.handleClick({
          action: "up",
          ts: Date.now()
        });
      });
    });
  });
}
