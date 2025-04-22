import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const Home = ({ socket }) => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const createRoom = () => {
    const id = uuidv4();
    setRoomId(id);
  };

  const joinRoom = () => {
    if (roomId) {
      navigate(`/room/${roomId}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md p-8 rounded-xl bg-gray-800 bg-opacity-50 backdrop-blur-sm shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            Video Chat
          </h1>
          <p className="text-gray-300">Connect with anyone</p>
        </div>
        
        <div className="space-y-6">
          <button 
            onClick={createRoom}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white font-medium rounded-lg transition-all duration-300 hover:from-purple-600 hover:to-pink-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
          >
            Create New Room
          </button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-800 text-gray-400">or join existing</span>
            </div>
          </div>
          
          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Enter Room ID" 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)} 
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-400"
            />
            
            <button 
              onClick={joinRoom}
              className="w-full py-3 bg-gray-700 text-white font-medium rounded-lg transition-all duration-300 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;