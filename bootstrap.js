const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

let log = msg => Components.classes['@mozilla.org/consoleservice;1'].
                 getService(Components.interfaces.nsIConsoleService).
                 logStringMessage(msg);

let httplsShim = {
  register: function() {
    Services.obs.addObserver(this, "content-document-global-created", false);
  },
  observe: function(subject, topic, data) {
    // see https://developer.mozilla.org/en-US/docs/Observer_Notifications
    if (topic == "content-document-global-created") {}
  },
  unregister: function() {
    Services.obs.removeObserver(this, "content-document-global-created");
  }
};

let handleTabSelect = e => {}

function loadIntoWindow(window) {
  // window here is a chrome window, not a dom window
  if (!window)
    return;

  log('hi');
  httplsShim.register();
  window.BrowserApp.deck.addEventListener("TabSelect", handleTabSelect);
}

function unloadFromWindow(window) {
  if (!window)
    return;

  httplsShim.unregister();
  httplsShim = null;
  window.BrowserApp.deck.removeEventListener("TabSelect", handleTabSelect);
}


/**
 * bootstrap.js API
 */
var windowListener = {
  onOpenWindow: function(window) {
    // Wait for the window to finish loading
    let domWindow = window.QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsIDOMWindowInternal || Ci.nsIDOMWindow);
    domWindow.addEventListener("load", function() {
      domWindow.removeEventListener("load", arguments.callee, false);
      loadIntoWindow(domWindow);
    }, false);
  },
  onCloseWindow: function(window) {},
  onWindowTitleChange: function(window, title) {}
};

function startup(data, reason) {
  // Load into any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
  }

  // Load into any new windows
  Services.wm.addListener(windowListener);
}

function shutdown(data, reason) {
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (reason == APP_SHUTDOWN)
    return;

  // Stop listening for new windows
  Services.wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
}

function install(data, reason) {}
function uninstall(data, reason) {}
