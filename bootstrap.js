const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

let log = msg => Components.classes['@mozilla.org/consoleservice;1'].
                 getService(Components.interfaces.nsIConsoleService).
                 logStringMessage(msg);
let chrome;

let httplsShim = {
  create: function() {
    Services.obs.addObserver(this, "content-document-global-created", false);
  },
  observe: function(subject, topic, data) {
    if (topic == "content-document-global-created") {
      let win = subject;
      win.addEventListener('DOMContentLoaded', this.checkForHLSVideo);
    }
  },
  destroy: function(window) {
    //window.content.removeEventListener(checkForHLSVideo);
    Services.obs.removeObserver(this, "content-document-global-created");
  },
  checkForHLSVideo: function(event) {
    // check for the first video element with .m3u or .m3u8 src
    // for now this is very dumb
    // doesn't handle document with multiple videos
    let doc = event.target.wrappedJSObject;
    let win = doc.defaultView;
    let hlsVideo = doc.querySelector('video[src*=\\.m3u]');

    if (hlsVideo) {
      chrome.content.console.log("got one");
      var worker = new Worker("chrome://shim/content/worker.js"),
        nextIndex = 0,
        sentVideos = 0,
        currentVideo = null,
        videos = [],
        lastOriginal,
        canvas = doc.getElementById('canvas'),
        context = canvas.getContext('2d'),
        //also there needs to be a parser to make sure the m3u8 doesnt just contain
        //more m3u8s
        manifest = hlsVideo.src;
        doc.body.appendChild(canvas);

        win.addEventListener('message', (e) => {
          let e = e.wrappedJSObject;
          let win = e.target;
          chrome.content.console.log(e);
          //need to construct the blob from this end, otherwise SOP
          //throws a tantrum.
          let blobURL = win.URL.createObjectURL(new win.Blob([e.data.bytes],
              {type: "video/mp4"}));
          let vid = win.document.getElementById(e.data.vidID)
          vid.src = vid.firstElementChild.src = blobURL;
          vid.load();
        });

      // drawing new frame
      function nextFrame() {
        if (currentVideo.paused || currentVideo.ended) {
          chrome.content.console.log('paused/ended');
          return;
        }
        context.drawImage(currentVideo, 0, 0);
        win.requestAnimationFrame(nextFrame);
      }

      worker.addEventListener('message', function (event) {
        var data = event.data;
        var descriptor = '#' + data.index;

        switch (data.type) {
          // got debug message from worker
          case 'debug':
            Function.prototype.apply.call(chrome.content.console[data.action], chrome.content.console, data.args);
            return;

          // got new converted MP4 video data
          case 'video':
            var video = doc.createElement('video'), source = doc.createElement('source');
            video.type = 'video/mp4';
            video.id = "hlsshim__" + data.index;
            video.controls = true;
            source.type = 'video/mp4';
            video.appendChild(source);
            doc.body.appendChild(video);
            //observations: video width and height are zero.
            //when the data comes back, it should be ready to go?
            //is it because i'm interacting with xraywrappers?
            //wrapped objects have to obey SOP

            video.addEventListener('loadedmetadata', (e) => {
              chrome.content.console.log('loadedmetadata', e.target);
              let vid = e.target.wrappedJSObject;
              if (canvas.width !== vid.videoWidth || canvas.height !== vid.videoHeight) {
                canvas.width = vid.width = vid.videoWidth;
                canvas.height = vid.height = vid.videoHeight;
              }
            });

            video.addEventListener('play', function (e) {
              chrome.content.console.log('play?', e);
              if (currentVideo !== this) {
                if (!currentVideo) {
                  var converter = {
                    worker: worker,
                    canvas: canvas,
                    get currentVideo() { return currentVideo }
                  };
                }
                chrome.content.console.log('playing ' + descriptor);
                currentVideo = this;
                nextIndex++;
                if (sentVideos - nextIndex <= 1) {
                  getMore();
                }
              }
              nextFrame();
            });

            video.addEventListener('ended', function () {
              chrome.content.console.log('ended?');
              chrome.content.URL.revokeObjectURL(this.src);
              delete videos[nextIndex - 1];
              if (nextIndex in videos) {
                videos[nextIndex].play();
              }
            });

            video.addEventListener('canplaythrough', function(e) {
              chrome.content.console.log('video ', e);
              videos[data.index] = this;
              if ((!currentVideo || currentVideo.ended) && data.index === nextIndex) {
                this.play();
              }
            });

            let payload = {bytes: data.bytes, vidID: "hlsshim__" + data.index};
            chrome.content.postMessage(payload, '*');
        }
      });

      // relative URL resolver
      var resolveURL = (function () {
        let old_base = doc.getElementsByTagName('base')[0];
        let old_href = old_base && old_base.href;
        let doc_head = doc.head
        let our_base = old_base || doc.createElement('base');
        let resolver = doc.createElement('a');
        let resolved_url;

        return function (base_url, url) {
          old_base || doc_head.appendChild(our_base);
          our_base.href = base_url;
          resolver.href = url;
          resolved_url  = resolver.href;
          old_base ? old_base.href = old_href : doc_head.removeChild(our_base);
          return resolved_url;
        };
      })();

      // loading more videos from manifest
      var getMore = function() {
        //the chrome window is never destroyed so i need a way to make this stop?
        var ajax = new chrome.XMLHttpRequest();
        ajax.addEventListener('load', function () {
          var originals =
            this.responseText
            .split(/\r?\n/)
            .filter(RegExp.prototype.test.bind(/\.ts$/))
            .map(resolveURL.bind(null, manifest));

          originals = originals.slice(originals.lastIndexOf(lastOriginal) + 1);
          lastOriginal = originals[originals.length - 1];

          worker.postMessage(originals.map(function (url, index) {
            return {url: url, index: sentVideos + index};
          }));

          sentVideos += originals.length;

          chrome.content.console.log('asked for ' + originals.length + ' more videos');
        });
        ajax.open('GET', manifest, true);
        ajax.send();
      }

      getMore();
    }
  }
};

let handleTabSelect = e => {}

function loadIntoWindow(window) {
  // window here is a chrome window, not a dom window
  if (!window)
    return;

  chrome = window;
  httplsShim.create(window);
  if (window.BrowserApp && window.BrowserApp.deck) {
    window.BrowserApp.deck.addEventListener("TabSelect", handleTabSelect);
  }
}

function unloadFromWindow(window) {
  if (!window)
    return;

  httplsShim.destroy(window);
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
