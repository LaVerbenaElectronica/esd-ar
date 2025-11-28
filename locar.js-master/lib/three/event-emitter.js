/** Event emitter class to handle events. */
class EventEmitter {
  constructor() {
    this.eventHandlers = {};
  }

  /**
   * Add an event handler.
   * @param {string} eventName - the event to handle.
   * @param {Function} eventHandler - the event handler function.
   */
  on(eventName, eventHandler) {
    if(this.eventHandlers[eventName] === undefined) {
      this.eventHandlers[eventName] = [];
    }
    this.eventHandlers[eventName].push(eventHandler);
  }

  /**
   * Emit an event.
   * @param {string} eventName - the event to emit.
   * @param ...params - parameters to pass to the event handlers.
   */
  emit(eventName, ...params) {
    this.eventHandlers[eventName]?.forEach( handler => {
      handler(...params);
    });
  }

  /**
   * Remove an event handler.
   * @param {string} eventName - the event to remove a handler from. 
   * @param {Function} eventHandler - the event handler function to remove.
   */
  off(eventName, eventHandler) {
    if(this.eventHandlers[eventName]) {
      const index = this.eventHandlers[eventName].indexOf(eventHandler);
      if(index > -1) {
        this.eventHandlers[eventName].splice(index, 1);
      }
    }
  }
}

export default EventEmitter;
