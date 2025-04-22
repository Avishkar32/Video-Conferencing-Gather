import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Room from './Room';
import io from 'socket.io-client';

const App = () => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io('https://video-conferencing-gather.onrender.com');
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white">
        <Routes>
          <Route path="/" element={<Home socket={socket} />} />
          <Route path="/room/:roomId" element={<Room socket={socket} />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;