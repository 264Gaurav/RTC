import React, { useState } from 'react';
import VideoCall from './components/VideoCall';
import './App.css';
import {toast} from 'react-hot-toast';

export default function App() {
  const [roomID, setRoomID] = useState('');
  const [joined, setJoined] = useState(false);

  const joinRoom = () => {
    if (!roomID.trim()) {
      toast.error('Please enter a Room ID to join!');
      return;
    }
    toast.success(`Joining room: ${roomID}`);
    setJoined(true);
  };

  return (
    <div className="app-container">
      {joined ? (
        <VideoCall roomID={roomID} />
      ) : (
        <div className="join-container">
          <h2>Join/Start a Video Call</h2>
          <hr className="divider" />
          <input
            type="text"
            placeholder="Room ID"
            value={roomID}
            onChange={e => setRoomID(e.target.value)}
          />
          <button className='join-btn' onClick={joinRoom}>
            Join
          </button>
        </div>
      )}
    </div>
  );
}
