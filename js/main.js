'use strict';

/****************************************************************************
* Initial setup
****************************************************************************/

var serverIp = '192.168.1.207';

var configuration = {
  'iceServers': [{
    'url': 'stun:stun.l.google.com:19302'
  }]
};

var roomURL = document.getElementById('url');
var context = new AudioContext();
var isInitiator;

var room = window.location.hash.substring(1);
if (!room) {
  room = window.location.hash = randomToken();
}



/****************************************************************************
* Signaling server
****************************************************************************/

var socket = io.connect();

socket.on('ipaddr', function(ipaddr) {
  console.log('Server IP address is: ' + ipaddr);
  updateRoomURL(ipaddr);
});

socket.on('created', function(room, clientId) {
  console.log('Created room', room, '- my client ID is', clientId);
  isInitiator = true;
});

socket.on('joined', function(room, clientId) {
  console.log('This peer has joined room', room, 'with client ID', clientId);
  isInitiator = false;
  createPeerConnection(isInitiator, configuration);
});

socket.on('full', function(room) {
  alert('Room ' + room + ' is full. We will create a new room for you.');
  window.location.hash = '';
  window.location.reload();
});

socket.on('ready', function() {
  console.log('Socket is ready');
  createPeerConnection(isInitiator, configuration);
});

socket.on('message', function(message) {
  console.log('Client received message:', message);
  signalingMessageCallback(message);
});


/****************************************************************************
* Begin
****************************************************************************/

console.log('Obtendo os arquivos de áudio...');
getAudioFiles();

socket.emit('create or join', room);

if (location.hostname.match('191.36.10.9')) {
  socket.emit('ipaddr');
}

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

function updateRoomURL(ipaddr) {
  var url;
  if (!ipaddr) {
    url = location.href;
  } else {
    url = location.protocol + '//' + ipaddr + ':8080/#' + room;
    console.log(url);
  }
  roomURL.innerHTML = url;
}

/****************************************************************************
* User media 
****************************************************************************/

var mediaSource, mediaBuffer, remoteDestination, mediaDescription;
var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
var audioFiles = ['do','re','mi','fa','sol','la'];
var audioSources = [];

function getAudioFiles(){

    for(i = 0; i < 6; i++){
         audioSources[i] = audioCtx.createBufferSource();
         var request = new XMLHttpRequest();
         request.open('GET', 'http://'+serverIp+':3000/'+audioFiles[i]+'.wav', true);
         request.responseType = 'arraybuffer';
         request.onload = function() {
            var audioData = request.response;
            audioCtx.decodeAudioData(audioData, function(buffer) {
                audioSources[i].buffer = buffer;
                audioSources[i].connect(audioCtx.destination);
                audioSources[i].loop = true;
            },
            function(e){ console.log("Error with decoding audio data" + e.err); });
        }
        request.send();
        var percent = (i + 1)*15;
        console.log(percent+'%');
    }
    console.log('Carregamento dos arquivos de audio completado!');
}


function handleFileSelect(notes,op,when) {

    for(i = 0; i < notes.length; i++){
        if(op){
            playTon (notes,when)
        }else{
            stopTon (notes,when)
        }
    } 
}

function playTon (note,when) {                            
    var position = audioFiles.indexOf(note);
    audioSources[position].start(when);
}

function stopTon (note,when) {                          
    var position = audioFiles.indexOf(note);
    audioSources[position].stop(audioCtx.currentTime + when);
}


/****************************************************************************
* WebRTC peer connection and data channel
****************************************************************************/

var peerConnInitiator = [];
var peerConn;
var peerConnCount = 0;
var dataChannelInitiator = [];
var dataChannel;
var notes = [];

function signalingMessageCallback(message) {

    if (message.type === 'offer') {

        if(isInitiator){
            console.log('Oferta Recebida como Inicializador!');
            peerConnInitiator[peerConnCount].setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
            peerConnInitiator[peerConnCount].createAnswer(onLocalSessionCreated, logError);
        }else{
            console.log('Oferta Recebida como Peer!');   
            peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
            peerConn.createAnswer(onLocalSessionCreated, logError);
        }

    }else if(message.type === 'answer') {
    
        if(isInitiator){
            console.log('Resposta Recebida como Incializador!');
            peerConnInitiator[peerConnCount].setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
        }else{
            console.log('Resposta Recebida como Peer!');
            peerConn.setRemoteDescription(new RTCSessionDescription(message), function() {}, logError);
        }

    }else if(message.type === 'candidate') {
    
        if(isInitiator){
            console.log('Candidato Recebido como Incializador!');
            peerConnInitiator[peerConnCount].addIceCandidate(new RTCIceCandidate({ candidate: message.candidate}));
        }else{
            console.log('Candidato Recebido como Peer!');
            peerConn.addIceCandidate(new RTCIceCandidate({ candidate: message.candidate}));
        }

    } else if (message === 'bye') {

    }
}

function createPeerConnection(isInitiator, config) {

    if(isInitiator){

        console.log('PeerConn Count: ' + peerConnCount)

        console.log("Criando conexão P2P do lado Iniciador!");
        peerConnInitiator[peerConnCount] = new RTCPeerConnection(config);

        peerConnInitiator[peerConnCount].onicecandidate = function(event) {
            console.log('Evento Candidato ICE - Iniciador:', event);
            if (event.candidate) {
                sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            }else{
                console.log('Fim dos candidatos');
            }
        };

        console.log('Criado canal de dados!');
        var label = 'audio' + peerConnCount;
        console.log('Label: ' + label);
        dataChannelInitiator[peerConnCount] = peerConnInitiator[peerConnCount].createDataChannel(label);  
        onDataChannelCreated(dataChannelInitiator[peerConnCount]);
        console.log('Criando uma oferta!');
        peerConnInitiator[peerConnCount].createOffer(onLocalSessionCreated, logError);

    }else{

        console.log("Criando conexão P2P do lado Peer!");
        peerConn = new RTCPeerConnection(config);

        peerConn.onicecandidate = function(event) {
            console.log('Evento Candidato ICE - Peer:', event);
            if (event.candidate) {
                sendMessage({
                    type: 'candidate',
                    label: event.candidate.sdpMLineIndex,
                    id: event.candidate.sdpMid,
                    candidate: event.candidate.candidate
                });
            }else{
                console.log('Fim dos candidatos!');
            }
        };

        peerConn.ondatachannel = function(event) {
            console.log('On DataChannel - Peer:', event.channel);
            dataChannel = event.channel;
            onDataChannelCreated(dataChannel);
        };
    }
}

function onLocalSessionCreated(desc) {

    if(isInitiator){
        console.log('Criando sessão local como Inicializador: ', desc);
        peerConnInitiator[peerConnCount].setLocalDescription(desc, function() {
            console.log('Enviado descritor local como Incializador:', peerConnInitiator[peerConnCount].localDescription);
            sendMessage(peerConnInitiator[peerConnCount].localDescription);
        }, logError);  
    }else{
        console.log('Criando sessão local como Peer', desc);
        peerConn.setLocalDescription(desc, function() {
            console.log('Eviando descritor local como Peer:', peerConn.localDescription);
            sendMessage(peerConn.localDescription);
        }, logError);
    }

}


function onDataChannelCreated(channel) {
  console.log('onDataChannelCreated:', channel);

  channel.onopen = function() {
    console.log('CHANNEL opened!!!');
    peerConnCount = peerConnCount + 1;
  };

  channel.onmessage = function(event){

    notes.push(event.data);

    if(isInitiator){
        console.log('Notas: ' + notes);
        //for(i = 0; i < peerConnCount, i++){
        //    dataChannelInitiator[i].send(notes); 
        //}
        dataChannelInitiator.every(send(notes));
    	handleFileSelect(notes,1,0);
        handleFileSelect(notes,0,0.5);
        notes.length = 0;	 
    }else{
        console.log('Nota: ' + notes);
        handleFileSelect(notes,1,0);
        handleFileSelect(notes,0,0.5);
        notes.length = 0;
    }
	      
  }
}



/****************************************************************************
* Aux functions, mostly UI-related
****************************************************************************/

function randomToken() {
  return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function logError(err) {
  console.log(err.toString(), err);
}

/****************************************************************************
* Button Fuctions
****************************************************************************/

$(document).ready(function () {

    $("#redbox").mouseover(function(){
        $("#redbox").attr("src", "img/mouseover_box.png");
        var note = [];
        note.push('do');
        handleFileSelect(note,1,0);
        dataChannel.send(note);
    });
    $("#redbox").mouseout(function(){
        $("#redbox").attr("src", "img/red_box.png");
        handleFileSelect("do",0,0);
    });

    $("#greenbox").mouseover(function(){
        $("#greenbox").attr("src", "img/mouseover_box.png");
        var note = [];
        note.push('re');
        handleFileSelect(note,1,0);
        dataChannel.send(note);
    });
    $("#greenbox").mouseout(function(){
        $("#greenbox").attr("src", "img/green_box.png");
        handleFileSelect("re",0,0);
    });

    $("#bluebox").mouseover(function(){
        $("#bluebox").attr("src", "img/mouseover_box.png");
        var note = [];
        note.push('mi');
        handleFileSelect(note,1,0);
        dataChannel.send(note);
    });
    $("#bluebox").mouseout(function(){
        $("#bluebox").attr("src", "img/blue_box.png");
        handleFileSelect("mi",0,0);
    });

    $("#purplebox").mouseover(function(){
        $("#purplebox").attr("src", "img/mouseover_box.png");
        var note = [];
        note.push('fa');
        handleFileSelect(note,1,0);
        dataChannel.send(note);
    });
    $("#purplebox").mouseout(function(){
        $("#purplebox").attr("src", "img/purple_box.png");
        handleFileSelect("fa",0,0);
    });

    $("#yellowbox").mouseover(function(){
        $("#yellowbox").attr("src", "img/mouseover_box.png");
        var note = [];
        note.push('sol');
        handleFileSelect(note,1,0);
        dataChannel.send(note);
    });
    $("#yellowbox").mouseout(function(){
        $("#yellowbox").attr("src", "img/yellow_box.png");
        handleFileSelect("sol",0,0);    
    });

    $("#blackbox").mouseover(function(){
        $("#blackbox").attr("src", "img/mouseover_box.png");
        var note = [];
        note.push('la');
        handleFileSelect(note,1,0);
        dataChannel.send(note);
    });
    $("#blackbox").mouseout(function(){
        $("#blackbox").attr("src", "img/black_box.png");
        handleFileSelect("la",0,0);
    });

});






