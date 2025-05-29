
import React, { useRef, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

const ICE_SERVERS = {
  iceServers: [
    { urls: import.meta.env.VITE_STUN_URL },
    ...(import.meta.env.VITE_TURN_URL ? [{
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    }] : []),
  ],
};

export default function VideoCall({ roomID }) {
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const pcRef = useRef(); //peer connection reference - ICE
  const socketRef = useRef();
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);

  useEffect(() => {
    socket.current = io(SIGNALING_SERVER_URL);

    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      localRef.current.srcObject = stream;

      pc.current = new RTCPeerConnection(ICE_SERVERS);

      stream.getTracks().forEach((track) => pc.current.addTrack(track, stream));

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Generated ICE Candidate:', event.candidate);
          socket.current.emit('signal', {
            to: roomID,
            from: socket.current.id,
            data: { candidate: event.candidate },
          });
          console.log('Shared ICE Candidate:', event.candidate);
        }
      };

      pc.current.ontrack = (event) => {
        console.log('Received remote track:', event.streams[0]);
        remoteRef.current.srcObject = event.streams[0];
      };

      socket.current.emit('join-room', roomID);
      console.log('Joined room:', roomID);

      socket.current.on('user-connected', (id) => {
        console.log('User connected:', id);
        pc.current
          .createOffer()
          .then((offer) => {
            console.log('Generated SDP Offer:', offer);
            return pc.current.setLocalDescription(offer);
          })
          .then(() => {
            socket.current.emit('signal', {
              to: id,
              from: socket.current.id,
              data: { sdp: pc.current.localDescription },
            });
            console.log('Shared SDP Offer:', pc.current.localDescription);
          });
      });

      socket.current.on('signal', (data) => {
        if (data.sdp) {
          console.log('Received SDP:', data.sdp);
          pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(() => {
            if (pc.current.remoteDescription.type === 'offer') {
              pc.current
                .createAnswer()
                .then((answer) => {
                  console.log('Generated SDP Answer:', answer);
                  return pc.current.setLocalDescription(answer);
                })
                .then(() => {
                  socket.current.emit('signal', {
                    to: data.from,
                    from: socket.current.id,
                    data: { sdp: pc.current.localDescription },
                  });
                  console.log('Shared SDP Answer:', pc.current.localDescription);
                });
            }
          });
        } else if (data.candidate) {
          console.log('Received ICE Candidate:', data.candidate);
          pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      });
    });
  }, [roomID]);

  const toggleMute = () => {
    localVideoRef.current.srcObject.getAudioTracks()[0].enabled = muted;
    setMuted(!muted);
  };

  const toggleVideo = () => {
    localVideoRef.current.srcObject.getVideoTracks()[0].enabled = videoOff;
    setVideoOff(!videoOff);
  };

  return (
    <div className="video-container">
      {/* Remote video of peer 2 */}
      <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
      {/* Local video (self-view) */}
      <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
      <div className="controls">
        <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={toggleVideo}>{videoOff ? 'Start Video' : 'Stop Video'}</button>
      </div>
    </div>
  );
}







































// import React, { useRef, useEffect, useState } from 'react';
// import io from 'socket.io-client';
// import activeMic from '../assets/icons/mic-on.svg'
// import inactiveMic from '../assets/icons/mic-off.svg';
// import cameraIcon from '../assets/icons/camera.svg';
// import cameraOff from '../assets/icons/camera-off.svg';
// import screenShare from '../assets/icons/screen-share.svg';
// import stopScreenShare from '../assets/icons/screen-stop.svg';
// import endCallIcon from '../assets/icons/call-end.svg';

// const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;
// const ICE_SERVERS = { iceServers: [
//   { urls: import.meta.env.VITE_STUN_URL },
//   ...(import.meta.env.VITE_TURN_URL?[{
//     urls: import.meta.env.VITE_TURN_URL,
//     username: import.meta.env.VITE_TURN_USERNAME,
//     credential: import.meta.env.VITE_TURN_CREDENTIAL,
//   }]:[]),
// ]};

// export default function VideoCall({ roomID }) {
//   const localRef=useRef(), remoteRef=useRef(), pc=useRef(), socket=useRef();
//   const [muted,setMuted]=useState(false),[videoOff,setVideoOff]=useState(false),
//         [sharing,setSharing]=useState(false);

//   // useEffect(()=>{
//   //   socket.current=io(SIGNALING_SERVER_URL);
//   //   navigator.mediaDevices.getUserMedia({video:true,audio:true}).then(stream=>{
//   //     localRef.current.srcObject=stream;
//   //     pc.current=new RTCPeerConnection(ICE_SERVERS);
//   //     stream.getTracks().forEach(t=>pc.current.addTrack(t,stream));
//   //     pc.current.onicecandidate=e=>e.candidate&&socket.current.emit('signal',{to:roomID,from:socket.current.id,data:{candidate:e.candidate}});
//   //     pc.current.ontrack=e=>{remoteRef.current.srcObject=e.streams[0];};
//   //     socket.current.emit('join-room',roomID);
//   //     socket.current.on('user-connected',id=>{pc.current.createOffer().then(o=>pc.current.setLocalDescription(o)).then(()=>socket.current.emit('signal',{to:id,from:socket.current.id,data:{sdp:pc.current.localDescription}}));});
//   //     socket.current.on('signal',async({from,data})=>{
//   //       if(from===socket.current.id) return;
//   //       if(data.sdp){
//   //         await pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
//   //         if(data.sdp.type==='offer'){
//   //           const ans=await pc.current.createAnswer();
//   //           await pc.current.setLocalDescription(ans);
//   //           socket.current.emit('signal',{to:from,from:socket.current.id,data:{sdp:pc.current.localDescription}});
//   //         }
//   //       } else if(data.candidate) await pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
//   //     });
//   //   });
//   //   return ()=>socket.current.disconnect();
//   // },[roomID]);


//   useEffect(() => {
//     socket.current = io(SIGNALING_SERVER_URL);

//     navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
//       localRef.current.srcObject = stream;

//       pc.current = new RTCPeerConnection(ICE_SERVERS);

//       // Add tracks to the peer connection
//       stream.getTracks().forEach((track) => pc.current.addTrack(track, stream));

//       // Log ICE candidates generated locally
//       pc.current.onicecandidate = (event) => {
//         if (event.candidate) {
//           console.log('Generated ICE Candidate:', event.candidate);
//           socket.current.emit('signal', {
//             to: roomID,
//             from: socket.current.id,
//             data: { candidate: event.candidate },
//           });
//         }
//       };

//       // Log STUN server response
//       pc.current.oniceconnectionstatechange = () => {
//         console.log('ICE Connection State:', pc.current.iceConnectionState);
//       };

//       // Log remote stream tracks
//       pc.current.ontrack = (event) => {
//         console.log('Remote stream track received:', event.streams[0]);
//         remoteRef.current.srcObject = event.streams[0];
//       };

//       // Join the room
//       socket.current.emit('join-room', roomID);

//       // Handle user connection
//       socket.current.on('user-connected', (id) => {
//         console.log('User connected:', id);

//         pc.current
//           .createOffer()
//           .then((offer) => {
//             console.log('Created Offer:', offer);
//             return pc.current.setLocalDescription(offer);
//           })
//           .then(() => {
//             socket.current.emit('signal', {
//               to: id,
//               from: socket.current.id,
//               data: { sdp: pc.current.localDescription },
//             });
//           });
//       });

//       // Handle incoming signals
//       socket.current.on('signal', (data) => {
//         console.log('Signal received:', data);

//         if (data.sdp) {
//           pc.current.setRemoteDescription(new RTCSessionDescription(data.sdp)).then(() => {
//             if (pc.current.remoteDescription.type === 'offer') {
//               pc.current
//                 .createAnswer()
//                 .then((answer) => {
//                   console.log('Created Answer:', answer);
//                   return pc.current.setLocalDescription(answer);
//                 })
//                 .then(() => {
//                   socket.current.emit('signal', {
//                     to: data.from,
//                     from: socket.current.id,
//                     data: { sdp: pc.current.localDescription },
//                   });
//                 });
//             }
//           });
//         } else if (data.candidate) {
//           console.log('Received ICE Candidate:', data.candidate);
//           pc.current.addIceCandidate(new RTCIceCandidate(data.candidate));
//         }
//       });
//     });
//   }, [roomID]);



//   const toggleMute=()=>{const audio=localRef.current.srcObject.getAudioTracks()[0];audio.enabled=!audio.enabled;setMuted(!muted);};
//   const toggleVideo=()=>{const vid=localRef.current.srcObject.getVideoTracks()[0];vid.enabled=!vid.enabled;setVideoOff(!videoOff);};
//   const toggleShare=async()=>{
//     if(!sharing){
//       const stream=await navigator.mediaDevices.getDisplayMedia({video:true});
//       const track=stream.getVideoTracks()[0];
//       pc.current.getSenders().find(s=>s.track.kind==='video').replaceTrack(track);
//       track.onended=()=>toggleShare();
//       setSharing(true);
//     } else {
//       const track=localRef.current.srcObject.getVideoTracks()[0];
//       pc.current.getSenders().find(s=>s.track.kind==='video').replaceTrack(track);
//       setSharing(false);
//     }
//   };

//   return (
//     <div className="video-container">
//       <video ref={remoteRef} autoPlay playsInline className="remote-video" />
//       <video ref={localRef} autoPlay muted playsInline className="local-video" />
//       <div className="controls">
//         <button className='call-btn' onClick={toggleMute}>{muted? <img className='call-icon' src={inactiveMic} alt="Mic" /> : <img className='call-icon' src={activeMic} alt="Mic" /> }</button>
//         <button className='call-btn' onClick={toggleVideo}>{videoOff? <img className='call-icon' src={cameraOff} alt="camera" /> : <img className='call-icon' src={cameraIcon} alt="camera" /> }</button>
//         <button className='call-btn' onClick={toggleShare}>{sharing? <img className='call-icon' src={stopScreenShare} alt="screen" /> : <img className='call-icon' src={screenShare} alt="screen" /> }</button>
//         <button className='call-btn' onClick={()=>{socket.current.disconnect();window.location.reload();}}><img className='call-icon' src={endCallIcon} alt="End Call" /></button>
//       </div>
//     </div>
//   );
// }










































// import React, { useRef, useEffect, useState } from 'react';
// import io from 'socket.io-client';


// const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

// const ICE_SERVERS = {
//   iceServers: [
//     { urls: 'stun:stun.l.google.com:19302' },
//     // Add your TURN server here
//     // { urls: 'turn:YOUR_TURN_SERVER', username: 'user', credential: 'pass' }
//   ],
// };

// export default function VideoCall({ roomID }) {
//   const localVideoRef = useRef();
//   const remoteVideoRef = useRef();
//   const pcRef = useRef();
//   const socketRef = useRef();
//   const [muted, setMuted] = useState(false);
//   const [videoOff, setVideoOff] = useState(false);

//   useEffect(() => {
//     socketRef.current = io(SIGNALING_SERVER_URL);
//     navigator.mediaDevices
//       .getUserMedia({ video: true, audio: true })
//       .then(stream => {
//         localVideoRef.current.srcObject = stream;
//         pcRef.current = new RTCPeerConnection(ICE_SERVERS);
//         console.log("pcRef : ",pcRef.current);

//         stream.getTracks().forEach(track => {
//           pcRef.current.addTrack(track, stream);
//         });

//         pcRef.current.onicecandidate = event => {
//           if (event.candidate) {
//             socketRef.current.emit('signal', {
//               to: roomID,
//               from: socketRef.current.id,
//               data: { candidate: event.candidate },
//             });
//           }
//         };

//         pcRef.current.ontrack = event => {
//           remoteVideoRef.current.srcObject = event.streams[0];
//         };

//         socketRef.current.emit('join-room', roomID);

//         socketRef.current.on('user-connected', userId => {
//           pcRef.current
//             .createOffer()
//             .then(offer => pcRef.current.setLocalDescription(offer))
//             .then(() => {
//               socketRef.current.emit('signal', {
//                 to: userId,
//                 from: socketRef.current.id,
//                 data: { sdp: pcRef.current.localDescription },
//               });
//             });
//         });

//         socketRef.current.on('signal', async ({ from, data }) => {
//           if (data.sdp) {
//             await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
//             if (data.sdp.type === 'offer') {
//               const answer = await pcRef.current.createAnswer();
//               await pcRef.current.setLocalDescription(answer);
//               socketRef.current.emit('signal', {
//                 to: from,
//                 from: socketRef.current.id,
//                 data: { sdp: pcRef.current.localDescription },
//               });
//             }
//           } else if (data.candidate) {
//             await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
//           }
//         });
//       });

//     return () => socketRef.current.disconnect();
//   }, [roomID]);

//   const toggleMute = () => {
//     localVideoRef.current.srcObject.getAudioTracks()[0].enabled = muted;
//     setMuted(!muted);
//   };

//   const toggleVideo = () => {
//     localVideoRef.current.srcObject.getVideoTracks()[0].enabled = videoOff;
//     setVideoOff(!videoOff);
//   };

//   return (
//     <div className="video-container">
//       {/* Remote video of peer 2 */}
//       <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
//       <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
//       <div className="controls">
//         <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
//         <button onClick={toggleVideo}>{videoOff ? 'Start Video' : 'Stop Video'}</button>
//       </div>
//     </div>
//   );
// }
