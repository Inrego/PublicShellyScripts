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
        isMatch: function(e, handler) {
          /*if (this.timerHandle != null) {
            Timer.clear(this.timerHandle);
            this.timerHandle = null;
            this.canMatch = false;
            handler.onSequenceFail(handler, this);
            return;
          }*/
          if (!this.canMatch) {
            handler.onSequenceFail(handler, this);
            return;
          }
          this.events.push(e);
          if (this.events.length > this.pattern.length) {
            this.canMatch = false;
            handler.onSequenceFail(handler, this);
            return;
          }
          var matchEvent = this.pattern[this.events.length - 1];
          if (matchEvent.action !== e.action) {
            this.canMatch = false;
            handler.onSequenceFail(handler, this);
            return;
          }
          
          var lastEvent = this.events.length == this.pattern.length;
          if (lastEvent) {
            this.timerHandle = Timer.set(matchEvent.duration * 1000, false, function(seq) {
              seq.timerHandle = null;
              if (!seq.canMatch) {
                return;
              }
              if (seq.checkTimer(e.ts, Date.now(), matchEvent)) {
                handler.onSequenceComplete(handler, seq);
              } else {
                seq.canMatch = false;
                handler.onSequenceFail(handler, seq);
              }
            }, this)
          } else if (this.events.length > 1) {
            var ev = this.events[this.events.length - 2];
            matchEvent = this.pattern[this.events.length - 2];
            if (!this.checkTimer(ev.ts, e.ts, matchEvent)) {
              this.canMatch = false;
              handler.onSequenceFail(handler, this);
              return;
            }
          }
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
    onSequenceComplete: function(handler, sequence) {
      this.reset();
      Shelly.emitEvent("custom_button_sequence", {sequence: sequence.name, component: handler.component});
    },
    onSequenceFail: function(handler, sequence) {
      sequence.reset();
      var i = handler.sequencesInProgress.indexOf(sequence);
      if (i >= 0) {
        handler.sequencesInProgress.splice(i, 1);
      }
      if (handler.sequencesInProgress.length === 0) {
        handler.reset();
      }
    },
    handleClick: function(e) {
      if (this.sequencesInProgress == null) {
        this.sequencesInProgress = this.sequences.map(function(x) {return x});
      }
      var sequences = "";
      for (var i = this.sequencesInProgress.length - 1; i >= 0; i--) {
        sequences += this.sequencesInProgress[i].name + ", "
      }
      for (var i = this.sequencesInProgress.length - 1; i >= 0; i--) {
        this.sequencesInProgress[i].isMatch(e, this);
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
      } else if (e.info.event === "btn_up") {
        action = "up"
      } else {
        return;
      }
      handler.handleClick({
        action: action,
        ts: e.info.ts * 1000
      })
    }
  }
});

function clickAndHold() {
  var handler = handlers["input:0"];
  handler.handleClick({
    action: "down",
    ts: Date.now()
  });
  Timer.set(50, false, function() {
    handler.handleClick({
      action: "up",
      ts: Date.now()
    });
    Timer.set(50, false, function() {
      handler.handleClick({
        action: "down",
        ts: Date.now()
      });
      Timer.set(5000, false, function() {
        handler.handleClick({
          action: "up",
          ts: Date.now()
        });
      });
    });
  });
}

function click() {
  var handler = handlers["input:0"];
  handler.handleClick({
    action: "down",
    ts: Date.now()
  });
  Timer.set(50, false, function() {
    handler.handleClick({
      action: "up",
      ts: Date.now()
    });
  });
}

function doubleClick() {
  var handler = handlers["input:0"];
  handler.handleClick({
    action: "down",
    ts: Date.now()
  });
  Timer.set(50, false, function() {
    handler.handleClick({
      action: "up",
      ts: Date.now()
    });
    Timer.set(50, false, function() {
      handler.handleClick({
        action: "down",
        ts: Date.now()
      });
      Timer.set(50, false, function() {
        handler.handleClick({
          action: "up",
          ts: Date.now()
        });
      });
    });
  });
}

function hold() {
  var handler = handlers["input:0"];
  handler.handleClick({
    action: "down",
    ts: Date.now()
  });
  Timer.set(5000, false, function() {
    handler.handleClick({
      action: "up",
      ts: Date.now()
    });
  });
}
