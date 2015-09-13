(function(window){

  var WORKER_PATH = 'recorderWorker.js';

  var WORKER_STRING = 'function init(a){sampleRate=a.sampleRate,numChannels=a.numChannels,initBuffers()}function record(a){for(var b=0;numChannels>b;b++)recBuffers[b].push(a[b]);recLength+=a[0].length}function exportWAV(a){for(var b=[],c=0;numChannels>c;c++)b.push(mergeBuffers(recBuffers[c],recLength));if(2===numChannels)var d=interleave(b[0],b[1]);else var d=b[0];var e=encodeWAV(d),f=new Blob([e],{type:a});this.postMessage(f)}function getBuffer(){for(var a=[],b=0;numChannels>b;b++)a.push(mergeBuffers(recBuffers[b],recLength));this.postMessage(a)}function clear(){recLength=0,recBuffers=[],initBuffers()}function initBuffers(){for(var a=0;numChannels>a;a++)recBuffers[a]=[]}function mergeBuffers(a,b){for(var c=new Float32Array(b),d=0,e=0;e<a.length;e++)c.set(a[e],d),d+=a[e].length;return c}function interleave(a,b){for(var c=a.length+b.length,d=new Float32Array(c),e=0,f=0;c>e;)d[e++]=a[f],d[e++]=b[f],f++;return d}function floatTo16BitPCM(a,b,c){for(var d=0;d<c.length;d++,b+=2){var e=Math.max(-1,Math.min(1,c[d]));a.setInt16(b,0>e?32768*e:32767*e,!0)}}function writeString(a,b,c){for(var d=0;d<c.length;d++)a.setUint8(b+d,c.charCodeAt(d))}function encodeWAV(a){var b=new ArrayBuffer(44+2*a.length),c=new DataView(b);return writeString(c,0,"RIFF"),c.setUint32(4,36+2*a.length,!0),writeString(c,8,"WAVE"),writeString(c,12,"fmt "),c.setUint32(16,16,!0),c.setUint16(20,1,!0),c.setUint16(22,numChannels,!0),c.setUint32(24,sampleRate,!0),c.setUint32(28,4*sampleRate,!0),c.setUint16(32,2*numChannels,!0),c.setUint16(34,16,!0),writeString(c,36,"data"),c.setUint32(40,2*a.length,!0),floatTo16BitPCM(c,44,a),c}var recLength=0,recBuffers=[],sampleRate,numChannels;this.onmessage=function(a){switch(a.data.command){case"init":init(a.data.config);break;case"record":record(a.data.buffer);break;case"exportWAV":exportWAV(a.data.type);break;case"getBuffer":getBuffer();break;case"clear":clear()}};';

  var Recorder = function(source, cfg){
    var config = cfg || {};
    var bufferLen = config.bufferLen || 4096;
    var numChannels = config.numChannels || 2;
    this.context = source.context;
    this.node = (this.context.createScriptProcessor ||
                 this.context.createJavaScriptNode).call(this.context,
                 bufferLen, numChannels, numChannels);
    var worker; // = new Worker(config.workerPath || WORKER_PATH);
    {
      var blob;
      try {
        blob = new Blob([WORKER_STRING], {type: 'application/javascript'});
      } catch (e) { // Backwards-compatibility
        window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;
        blob = new BlobBuilder();
        blob.append(response);
        blob = blob.getBlob();
      }
      worker = new Worker(URL.createObjectURL(blob));
    }
    worker.postMessage({
      command: 'init',
      config: {
        sampleRate: this.context.sampleRate,
        numChannels: numChannels
      }
    });
    var recording = false,
      currCallback;

    this.node.onaudioprocess = function(e){
      if (!recording) return;
      var buffer = [];
      for (var channel = 0; channel < numChannels; channel++){
          buffer.push(e.inputBuffer.getChannelData(channel));
      }
      worker.postMessage({
        command: 'record',
        buffer: buffer
      });
    }

    this.configure = function(cfg){
      for (var prop in cfg){
        if (cfg.hasOwnProperty(prop)){
          config[prop] = cfg[prop];
        }
      }
    }

    this.record = function(){
      recording = true;
    }

    this.stop = function(){
      recording = false;
    }

    this.clear = function(){
      worker.postMessage({ command: 'clear' });
    }

    this.getBuffer = function(cb) {
      currCallback = cb || config.callback;
      worker.postMessage({ command: 'getBuffer' })
    }

    this.exportWAV = function(cb, type){
      currCallback = cb || config.callback;
      type = type || config.type || 'audio/wav';
      if (!currCallback) throw new Error('Callback not set');
      worker.postMessage({
        command: 'exportWAV',
        type: type
      });
    }

    worker.onmessage = function(e){
      var blob = e.data;
      currCallback(blob);
    }

    source.connect(this.node);
    this.node.connect(this.context.destination);    //this should not be necessary
  };

  Recorder.forceDownload = function(blob, filename){
    var url = (window.URL || window.webkitURL).createObjectURL(blob);
    var link = window.document.createElement('a');
    link.href = url;
    link.download = filename || 'output.wav';
    var click = document.createEvent("Event");
    click.initEvent("click", true, true);
    link.dispatchEvent(click);
  }

  window.Recorder = Recorder;

})(window);
