import React, { useRef, useEffect, useState } from 'react';
import io from 'socket.io-client';
import {toast} from 'react-hot-toast';

import activeMic from '../assets/icons/mic-on.svg'
import inactiveMic from '../assets/icons/mic-off.svg';
import cameraIcon from '../assets/icons/camera.svg';
import cameraOff from '../assets/icons/camera-off.svg';
import endCallIcon from '../assets/icons/call-end.svg';


// These environment variables would typically be configured in a .env file
// For demonstration, we'll use placeholder values if they're not defined.
// In a real application, ensure these are properly set up.
const SIGNALING_SERVER_URL = typeof import.meta.env.VITE_SIGNALING_SERVER_URL !== 'undefined'
  ? import.meta.env.VITE_SIGNALING_SERVER_URL
  : 'http://localhost:3001'; // Default for local testing

const ICE_SERVERS = {
  iceServers: [
    { urls: typeof import.meta.env.VITE_STUN_URL !== 'undefined' ? import.meta.env.VITE_STUN_URL : 'stun:stun.l.google.com:19302' },
    ...(typeof import.meta.env.VITE_TURN_URL !== 'undefined' ? [{
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    }] : []),
  ],
};

export default function App({ roomID }) { // Changed to App as per React component export convention
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const pcRef = useRef(); // Peer connection reference - ICE
  const socketRef = useRef();

  // Initialize muted and videoOff to false, meaning mic and video are initially ON
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);


  useEffect(() => {
    // Initialize the socket connection to the signaling server
    console.log('Initializing socket connection to signaling server:', SIGNALING_SERVER_URL);
    socketRef.current = io(SIGNALING_SERVER_URL);

    // Request access to the user's media devices (camera and microphone)
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then(stream => {
        console.log('Successfully obtained local media stream.');
        // Set the local video element's source to the user's media stream
        localVideoRef.current.srcObject = stream;

        // Create a new RTCPeerConnection instance with ICE server configurations
        console.log('Creating new RTCPeerConnection with ICE servers:', ICE_SERVERS);
        pcRef.current = new RTCPeerConnection(ICE_SERVERS);

        // Add each track (audio/video) from the user's media stream to the peer connection
        stream.getTracks().forEach(track => {
          pcRef.current.addTrack(track, stream);
          console.log(`Added track: ${track.kind} to peer connection.`);
        });

        // Handle the generation of ICE candidates
        pcRef.current.onicecandidate = event => {
          if (event.candidate) {
            console.log('Generated ICE candidate:', event.candidate);
            // Send the ICE candidate to the signaling server
            console.log('Sending ICE candidate to signaling server...');
            socketRef.current.emit('signal', {
              to: roomID, // Target room ID
              from: socketRef.current.id, // Current user's socket ID
              data: { candidate: event.candidate }, // ICE candidate data
            });
          } else {
            console.log('ICE gathering complete.');
          }
        };

        // Handle incoming media tracks from the remote peer
        pcRef.current.ontrack = event => {
          console.log('Received remote track:', event.track.kind);
          // Set the remote video element's source to the received media stream
          remoteVideoRef.current.srcObject = event.streams[0];
        };

        // Notify the signaling server that the user has joined the room
        console.log('Joining room:', roomID);
        socketRef.current.emit('join-room', roomID);

        // Handle when a new user connects to the room
        socketRef.current.on('user-connected', userId => {
          console.log(`User connected: ${userId}. Creating SDP offer...`);
          // Create an SDP offer to initiate the WebRTC connection
          pcRef.current
            .createOffer()
            .then(offer => {
              console.log('SDP offer created:', offer);
              return pcRef.current.setLocalDescription(offer); // Set the local description with the offer
            })
            .then(() => {
              console.log('Local description set with SDP offer.');
              // Send the SDP offer to the newly connected user via the signaling server
              console.log('Sending SDP offer to user:', userId);
              socketRef.current.emit('signal', {
                to: userId, // Target user ID
                from: socketRef.current.id, // Current user's socket ID
                data: { sdp: pcRef.current.localDescription }, // SDP offer data
              });
            })
            .catch(error => {
              console.error('Error creating or setting SDP offer:', error);
            });
        });

        // Handle incoming signaling data (SDP or ICE candidates)
        socketRef.current.on('signal', async ({ from, data }) => {
          if (data.sdp) {
            console.log("Received SDP signal from:", from, "Type:", data.sdp.type, "SDP:", data.sdp);

            // Set the remote description with the received SDP
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
              console.log('Remote description set with received SDP.');

              if (data.sdp.type === 'offer') {
                console.log('SDP type is offer. Creating SDP answer...');
                // If the SDP is an offer, create an SDP answer
                const answer = await pcRef.current.createAnswer();
                console.log('SDP answer created:', answer);
                await pcRef.current.setLocalDescription(answer); // Set the local description with the answer
                console.log('Local description set with SDP answer.');
                // Send the SDP answer back to the offerer via the signaling server
                console.log('Sending SDP answer to user:', from);
                socketRef.current.emit('signal', {
                  to: from, // Target user ID
                  from: socketRef.current.id, // Current user's socket ID
                  data: { sdp: pcRef.current.localDescription }, // SDP answer data
                });
              }
            } catch (error) {
              console.error('Error setting remote description or creating/setting answer:', error);
            }
          } else if (data.candidate) {
            console.log("Received ICE candidate from:", from, "Candidate:", data.candidate);
            // Add the received ICE candidate to the peer connection
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
              console.log('ICE candidate added to peer connection.');
            } catch (error) {
              console.error('Error adding ICE candidate:', error);
            }
          }
        });
      })
      .catch(error => {
        console.error('Error accessing media devices:', error);
        toast.error('Error accessing media devices. Please check your camera/microphone permissions.');
      });

    // Cleanup function to disconnect the socket and close peer connection when the component unmounts
    return () => {
      console.log('Disconnecting socket and closing peer connection.');
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (pcRef.current) {
        // Stop all tracks before closing the peer connection
        if (localVideoRef.current && localVideoRef.current.srcObject) {
          localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
        }
        pcRef.current.close();
      }
    };

  }, [roomID]); // Re-run the effect when the roomID changes

  // Function to toggle microphone mute/unmute
  const toggleMute = () => {
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      const audioTracks = localVideoRef.current.srcObject.getAudioTracks();
      if (audioTracks.length > 0) {
        const newMutedState = !muted; // Determine the new muted state
        audioTracks[0].enabled = !newMutedState; // Enable/disable the track based on the new state
        setMuted(newMutedState); // Update the state
        toast.success(`Mic ${(newMutedState === true) ? 'muted' : 'unmuted'}`);
      } else {
        console.warn('No audio tracks found to toggle mute.');
        toast.error('No audio tracks found.');
      }
    }
  };

  // Function to toggle video on/off
  const toggleVideo = () => {
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      const videoTracks = localVideoRef.current.srcObject.getVideoTracks();
      if (videoTracks.length > 0) {
        const newVideoOffState = !videoOff; // Determine the new video off state
        videoTracks[0].enabled = !newVideoOffState; // Enable/disable the track based on the new state
        setVideoOff(newVideoOffState); // Update the state
        toast.success(`Video ${(newVideoOffState === true) ? 'stopped' : 'started'}`);
      } else {
        console.warn('No video tracks found to toggle video.');
        toast.error('No video tracks found.');
      }
    }
  };

  // Function to end the call
  const endCall = () => {
    // Disconnect socket and reload the page to end the call and reset state
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    // Stop local tracks before reloading
    if (localVideoRef.current && localVideoRef.current.srcObject) {
      localVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    window.location.reload();
  };

  return (
    <>
      <div className="video-container">
        <h3 className="text-3xl font-bold mb-6 text-blue-400">Comm. Room ID: {roomID}</h3>

        <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
        <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />


        {/* Call Controls */}
        <div className="controls">
          {/* Mute/Unmute Button */}
          <button
            onClick={toggleMute}
            className="call-btn"
          >
            {/* Display active mic icon if not muted, inactive mic icon if muted */}
            {muted ? (
              <img className='call-icon' src={inactiveMic} alt="Mic Off" />
            ) : (
              <img className='call-icon' src={activeMic} alt="Mic On" />
            )}
          </button>

          {/* Video On/Off Button */}
          <button
            onClick={toggleVideo}
            className="call-btn"
          >
            {/* Display camera off icon if video is off, camera on icon if video is on */}
            {videoOff ? (
              <img className='call-icon' src={cameraOff} alt="Camera Off" />
            ) : (
              <img className='call-icon' src={cameraIcon} alt="Camera On" />
            )}
          </button>

          {/* End Call Button */}
          <button
            onClick={endCall}
            className="call-btn end-call-btn" // Added a specific class for end call button styling
          >
            <img className='call-icon' src={endCallIcon} alt="End Call" />
          </button>
        </div>
      </div>
    </>
  );
}



































// import React, { useRef, useEffect, useState } from 'react';
// import io from 'socket.io-client';
// import {toast} from 'react-hot-toast';

// import activeMic from '../assets/icons/mic-on.svg'
// import inactiveMic from '../assets/icons/mic-off.svg';
// import cameraIcon from '../assets/icons/camera.svg';
// import cameraOff from '../assets/icons/camera-off.svg';
// import endCallIcon from '../assets/icons/call-end.svg';


// // These environment variables would typically be configured in a .env file
// // For demonstration, we'll use placeholder values if they're not defined.
// // In a real application, ensure these are properly set up.
// const SIGNALING_SERVER_URL = typeof import.meta.env.VITE_SIGNALING_SERVER_URL !== 'undefined'
//   ? import.meta.env.VITE_SIGNALING_SERVER_URL
//   : 'http://localhost:3001'; // Default for local testing

// const ICE_SERVERS = {
//   iceServers: [
//     { urls: typeof import.meta.env.VITE_STUN_URL !== 'undefined' ? import.meta.env.VITE_STUN_URL : 'stun:stun.l.google.com:19302' },
//     ...(typeof import.meta.env.VITE_TURN_URL !== 'undefined' ? [{
//       urls: import.meta.env.VITE_TURN_URL,
//       username: import.meta.env.VITE_TURN_USERNAME,
//       credential: import.meta.env.VITE_TURN_CREDENTIAL,
//     }] : []),
//   ],
// };

// export default function VideoCall({ roomID }) {
//   const localVideoRef = useRef();
//   const remoteVideoRef = useRef();
//   const pcRef = useRef(); // Peer connection reference - ICE
//   const socketRef = useRef();

//   const [muted, setMuted] = useState(false);
//   const [videoOff, setVideoOff] = useState(false);


//   useEffect(() => {
//     // Initialize the socket connection to the signaling server
//     console.log('Initializing socket connection to signaling server:', SIGNALING_SERVER_URL);
//     socketRef.current = io(SIGNALING_SERVER_URL);

//     // Request access to the user's media devices (camera and microphone)
//     navigator.mediaDevices
//       .getUserMedia({ video: true, audio: true })
//       .then(stream => {
//         console.log('Successfully obtained local media stream.');
//         // Set the local video element's source to the user's media stream
//         localVideoRef.current.srcObject = stream;

//         // Create a new RTCPeerConnection instance with ICE server configurations
//         console.log('Creating new RTCPeerConnection with ICE servers:', ICE_SERVERS);
//         pcRef.current = new RTCPeerConnection(ICE_SERVERS);

//         // Add each track (audio/video) from the user's media stream to the peer connection
//         stream.getTracks().forEach(track => {
//           pcRef.current.addTrack(track, stream);
//           console.log(`Added track: ${track.kind} to peer connection.`);
//         });

//         // Handle the generation of ICE candidates
//         pcRef.current.onicecandidate = event => {
//           if (event.candidate) {
//             console.log('Generated ICE candidate:', event.candidate);
//             // Send the ICE candidate to the signaling server
//             console.log('Sending ICE candidate to signaling server...');
//             socketRef.current.emit('signal', {
//               to: roomID, // Target room ID
//               from: socketRef.current.id, // Current user's socket ID
//               data: { candidate: event.candidate }, // ICE candidate data
//             });
//           } else {
//             console.log('ICE gathering complete.');
//           }
//         };

//         // Handle incoming media tracks from the remote peer
//         pcRef.current.ontrack = event => {
//           console.log('Received remote track:', event.track.kind);
//           // Set the remote video element's source to the received media stream
//           remoteVideoRef.current.srcObject = event.streams[0];
//         };

//         // Notify the signaling server that the user has joined the room
//         console.log('Joining room:', roomID);
//         socketRef.current.emit('join-room', roomID);

//         // Handle when a new user connects to the room
//         socketRef.current.on('user-connected', userId => {
//           console.log(`User connected: ${userId}. Creating SDP offer...`);
//           // Create an SDP offer to initiate the WebRTC connection
//           pcRef.current
//             .createOffer()
//             .then(offer => {
//               console.log('SDP offer created:', offer);
//               return pcRef.current.setLocalDescription(offer); // Set the local description with the offer
//             })
//             .then(() => {
//               console.log('Local description set with SDP offer.');
//               // Send the SDP offer to the newly connected user via the signaling server
//               console.log('Sending SDP offer to user:', userId);
//               socketRef.current.emit('signal', {
//                 to: userId, // Target user ID
//                 from: socketRef.current.id, // Current user's socket ID
//                 data: { sdp: pcRef.current.localDescription }, // SDP offer data
//               });
//             })
//             .catch(error => {
//               console.error('Error creating or setting SDP offer:', error);
//             });
//         });

//         // Handle incoming signaling data (SDP or ICE candidates)
//         socketRef.current.on('signal', async ({ from, data }) => {
//           if (data.sdp) {
//             console.log("Received SDP signal from:", from, "Type:", data.sdp.type, "SDP:", data.sdp);

//             // Set the remote description with the received SDP
//             try {
//               await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
//               console.log('Remote description set with received SDP.');

//               if (data.sdp.type === 'offer') {
//                 console.log('SDP type is offer. Creating SDP answer...');
//                 // If the SDP is an offer, create an SDP answer
//                 const answer = await pcRef.current.createAnswer();
//                 console.log('SDP answer created:', answer);
//                 await pcRef.current.setLocalDescription(answer); // Set the local description with the answer
//                 console.log('Local description set with SDP answer.');
//                 // Send the SDP answer back to the offerer via the signaling server
//                 console.log('Sending SDP answer to user:', from);
//                 socketRef.current.emit('signal', {
//                   to: from, // Target user ID
//                   from: socketRef.current.id, // Current user's socket ID
//                   data: { sdp: pcRef.current.localDescription }, // SDP answer data
//                 });
//               }
//             } catch (error) {
//               console.error('Error setting remote description or creating/setting answer:', error);
//             }
//           } else if (data.candidate) {
//             console.log("Received ICE candidate from:", from, "Candidate:", data.candidate);
//             // Add the received ICE candidate to the peer connection
//             try {
//               await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
//               console.log('ICE candidate added to peer connection.');
//             } catch (error) {
//               console.error('Error adding ICE candidate:', error);
//             }
//           }
//         });
//       })
//       .catch(error => {
//         console.error('Error accessing media devices:', error);
//       });

//     // Cleanup function to disconnect the socket when the component unmounts
//     return () => {
//       console.log('Disconnecting socket and closing peer connection.');
//       socketRef.current.disconnect();
//       if (pcRef.current) {
//         pcRef.current.close();
//       }
//     };

//   }, [roomID]); // Re-run the effect when the roomID changes

//   const toggleMute = () => {
//     if (localVideoRef.current && localVideoRef.current.srcObject) {
//       const audioTracks = localVideoRef.current.srcObject.getAudioTracks();
//       if (audioTracks.length > 0) {
//         audioTracks[0].enabled = !muted;
//         setMuted(!muted);
//       } else {
//         console.warn('No audio tracks found to toggle mute.');
//       }
//     }
//     toast.success(`Mic ${(muted === true) ? 'unmuted' : 'muted'}`);
//   };

//   const toggleVideo = () => {
//     if (localVideoRef.current && localVideoRef.current.srcObject) {
//       const videoTracks = localVideoRef.current.srcObject.getVideoTracks();
//       if (videoTracks.length > 0) {
//         videoTracks[0].enabled = !videoOff;
//         setVideoOff(!videoOff);
//       } else {
//         console.warn('No video tracks found to toggle video.');
//       }
//     }
//     toast.success(`Video ${(videoOff === true) ? 'stopped' : 'started'}`);
//   };

//   return (
//     <div className="video-container">
//       <h3 className="text-3xl font-bold mb-6 text-blue-400">Comm. Room ID: {roomID}</h3>

//       <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
//       <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />

//         <div className="controls">
//           <button className='call-btn' onClick={toggleMute}>{(muted === true) ? <img className='call-icon' src={activeMic} alt="Mic" /> : <img className='call-icon' src={inactiveMic} alt="Mic" /> }</button>
//           <button className='call-btn' onClick={toggleVideo}>{(videoOff === true) ? <img className='call-icon' src={cameraIcon} alt="camera" /> : <img className='call-icon' src={cameraOff} alt="camera" /> }</button>
//           <button className='call-btn' onClick={()=>{socketRef.current.disconnect();window.location.reload();}}><img className='call-icon' src={endCallIcon} alt="End Call" /></button>
//         </div>

//     </div>
//   );
// }









































// import React, { useRef, useEffect, useState } from 'react';
// import io from 'socket.io-client';

// const SIGNALING_SERVER_URL = import.meta.env.VITE_SIGNALING_SERVER_URL;

// const ICE_SERVERS = {
//   iceServers: [
//     { urls: import.meta.env.VITE_STUN_URL },
//     ...(import.meta.env.VITE_TURN_URL ? [{
//       urls: import.meta.env.VITE_TURN_URL,
//       username: import.meta.env.VITE_TURN_USERNAME,
//       credential: import.meta.env.VITE_TURN_CREDENTIAL,
//     }] : []),
//   ],
// };

// export default function VideoCall({ roomID }) {
//   const localVideoRef = useRef();
//   const remoteVideoRef = useRef();
//   const pcRef = useRef(); //peer connection reference - ICE
//   const socketRef = useRef();
//   const [muted, setMuted] = useState(false);
//   const [videoOff, setVideoOff] = useState(false);

//   useEffect(() => {
//     // Initialize the socket connection to the signaling server
//     socketRef.current = io(SIGNALING_SERVER_URL);

//     // Request access to the user's media devices (camera and microphone)
//     navigator.mediaDevices
//       .getUserMedia({ video: true, audio: true })
//       .then(stream => {
//         // Set the local video element's source to the user's media stream
//         localVideoRef.current.srcObject = stream;

//         // Create a new RTCPeerConnection instance with ICE server configurations
//         pcRef.current = new RTCPeerConnection(ICE_SERVERS);

//         // Add each track (audio/video) from the user's media stream to the peer connection
//         stream.getTracks().forEach(track => {
//           pcRef.current.addTrack(track, stream);
//         });

//         // Handle the generation of ICE candidates
//         pcRef.current.onicecandidate = event => {
//           if (event.candidate) {
//             // Send the ICE candidate to the signaling server
//             socketRef.current.emit('signal', {
//               to: roomID, // Target room ID
//               from: socketRef.current.id, // Current user's socket ID
//               data: { candidate: event.candidate }, // ICE candidate data
//             });
//           }
//         };

//         // Handle incoming media tracks from the remote peer
//         pcRef.current.ontrack = event => {
//           // Set the remote video element's source to the received media stream
//           remoteVideoRef.current.srcObject = event.streams[0];
//         };

//         // Notify the signaling server that the user has joined the room
//         socketRef.current.emit('join-room', roomID);

//         // Handle when a new user connects to the room
//         socketRef.current.on('user-connected', userId => {
//           // Create an SDP offer to initiate the WebRTC connection
//           pcRef.current
//             .createOffer()
//             .then(offer => pcRef.current.setLocalDescription(offer)) // Set the local description with the offer
//             .then(() => {
//               // Send the SDP offer to the newly connected user via the signaling server
//             socketRef.current.emit('signal', {
//                 to: userId, // Target user ID
//                 from: socketRef.current.id, // Current user's socket ID
//                 data: { sdp: pcRef.current.localDescription }, // SDP offer data
//               });
//             });
//         });

//         // Handle incoming signaling data (SDP or ICE candidates)
//         socketRef.current.on('signal', async ({ from, data }) => {
//           if (data.sdp) {
//             console.log("SDP sharing and handling : ", data.sdp);

//             // Set the remote description with the received SDP
//             await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
//             if (data.sdp.type === 'offer') {
//               // If the SDP is an offer, create an SDP answer
//               const answer = await pcRef.current.createAnswer();
//               await pcRef.current.setLocalDescription(answer); // Set the local description with the answer
//               // Send the SDP answer back to the offerer via the signaling server
//               socketRef.current.emit('signal', {
//                 to: from, // Target user ID
//                 from: socketRef.current.id, // Current user's socket ID
//                 data: { sdp: pcRef.current.localDescription }, // SDP answer data
//               });
//             }
//           } else if (data.candidate) {
//             console.log("ICE candidate sharing and handling : ", data.candidate);
//             // Add the received ICE candidate to the peer connection
//             await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
//           }
//         });
//       });

//     // Cleanup function to disconnect the socket when the component unmounts
//     return () => socketRef.current.disconnect();
//   }, [roomID]); // Re-run the effect when the roomID changes

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
//       {/* Local video (self-view) */}
//       <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
//       <div className="controls">
//         <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
//         <button onClick={toggleVideo}>{videoOff ? 'Start Video' : 'Stop Video'}</button>
//       </div>
//     </div>
//   );
// }







































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
