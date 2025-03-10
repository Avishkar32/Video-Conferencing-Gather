import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const Room = ({ socket }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [peers, setPeers] = useState({});
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [participantCount, setParticipantCount] = useState(1); // including self
  const localVideoRef = useRef(null);
  const peerConnections = useRef({});
  const peerVideos = useRef({});

  useEffect(() => {
    if (!socket) return;

    // Get user media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = currentStream;
        }

        // Join room
        socket.emit('join-room', roomId);

        // Handle new user joining
        socket.on('user-connected', (userId) => {
          setParticipantCount(prevCount => prevCount + 1);
          connectToNewUser(userId, currentStream);
        });

        // Handle user disconnected
        socket.on('user-disconnected', (userId) => {
          setParticipantCount(prevCount => Math.max(prevCount - 1, 1));
          
          // Close and cleanup the peer connection
          if (peerConnections.current[userId]) {
            peerConnections.current[userId].close();
            delete peerConnections.current[userId];
          }
          
          // Remove the peer's video stream
          if (peerVideos.current[userId]) {
            delete peerVideos.current[userId];
          }
          
          // Update peers state by removing the disconnected user
          setPeers(prevPeers => {
            const newPeers = { ...prevPeers };
            delete newPeers[userId];
            return newPeers;
          });
        });

        // Receive offer from server
        socket.on('offer', async ({ from, offer }) => {
          console.log('Received offer from:', from);
          try {
            // Create a new peer connection if it doesn't exist
            if (!peerConnections.current[from]) {
              peerConnections.current[from] = createPeerConnection(from, currentStream);
            }
            
            const pc = peerConnections.current[from];
            // Check connection state before setting remote description
            if (pc.signalingState !== 'stable') {
              console.log('Signaling state is not stable, rolling back');
              await Promise.all([
                pc.setLocalDescription({type: "rollback"}),
                pc.setRemoteDescription(new RTCSessionDescription(offer))
              ]);
            } else {
              await pc.setRemoteDescription(new RTCSessionDescription(offer));
            }
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { to: from, answer });
          } catch (error) {
            console.error('Error handling offer:', error);
          }
        });

        // Receive answer from server
        socket.on('answer', async ({ from, answer }) => {
          console.log('Received answer from:', from);
          try {
            const pc = peerConnections.current[from];
            if (pc) {
              // Check connection state before setting remote description
              if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
              } else {
                console.warn('Cannot set remote description in current state:', pc.signalingState);
              }
            }
          } catch (error) {
            console.error('Error handling answer:', error);
          }
        });

        // Receive ICE candidate from server
        socket.on('ice-candidate', async ({ from, candidate }) => {
          try {
            const pc = peerConnections.current[from];
            if (pc && candidate) {
              // Wait for remote description to be set before adding ICE candidates
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
              } else {
                console.warn('Received ICE candidate before remote description was set');
              }
            }
          } catch (error) {
            console.error('Error adding received ICE candidate:', error);
          }
        });
      })
      .catch((error) => {
        console.error('Error accessing media devices:', error);
      });

    return () => {
      // Cleanup
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      Object.values(peerConnections.current).forEach(connection => {
        if (connection) {
          connection.close();
        }
      });
      
      if (socket) {
        socket.off('user-connected');
        socket.off('user-disconnected');
        socket.off('offer');
        socket.off('answer');
        socket.off('ice-candidate');
        socket.emit('leave-room', roomId);
      }
      peerConnections.current = {};
      peerVideos.current = {};
      setPeers({});
    };
  }, [socket, roomId]);

  const createPeerConnection = (userId, stream) => {
    console.log('Creating peer connection for user:', userId);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local tracks to the peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Listen for ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          to: userId,
          candidate: event.candidate
        });
      }
    };

    // Listen for connection state changes
    pc.onconnectionstatechange = (event) => {
      console.log(`Connection state change for ${userId}:`, pc.connectionState);
    };

    // Listen for signaling state changes
    pc.onsignalingstatechange = (event) => {
      console.log(`Signaling state change for ${userId}:`, pc.signalingState);
    };

    // Listen for remote tracks
    pc.ontrack = (event) => {
      console.log('Received remote track from:', userId);
      if (!peerVideos.current[userId]) {
        peerVideos.current[userId] = new MediaStream();
        setPeers(prevPeers => ({
          ...prevPeers,
          [userId]: peerVideos.current[userId]
        }));
      }
      
      event.streams[0].getTracks().forEach(track => {
        peerVideos.current[userId].addTrack(track);
      });
    };

    return pc;
  };

  const connectToNewUser = async (userId, stream) => {
    console.log('Connecting to new user:', userId);
    try {
      const pc = createPeerConnection(userId, stream);
      peerConnections.current[userId] = pc;

      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('Sending offer to:', userId);
      socket.emit('offer', { to: userId, offer });
    } catch (error) {
      console.error('Error connecting to new user:', error);
    }
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const leaveRoom = () => {
    navigate('/');
  };

  const getGridClass = () => {
    const totalParticipants = Object.keys(peers).length + 1; // Including self
    
    // Fixed grid layout based on total number of participants
    if (totalParticipants === 1) return "grid-cols-1";
    if (totalParticipants === 2) return "grid-cols-1 md:grid-cols-2";
    if (totalParticipants === 3) return "grid-cols-1 md:grid-cols-3";
    if (totalParticipants === 4) return "grid-cols-2 md:grid-cols-2"; // 2x2 grid for 4 participants
    if (totalParticipants <= 6) return "grid-cols-2 md:grid-cols-3"; // 2x3 grid for 5-6 participants
    return "grid-cols-2 md:grid-cols-4"; // 2x4 grid for 7+ participants
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert("Room ID copied to clipboard!");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800">
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-gray-300">Live</span>
          </div>
          <div className="h-4 border-l border-gray-600"></div>
          <div className="flex items-center space-x-1">
            <span className="text-sm font-medium text-gray-300">{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        
        <div className="flex items-center" onClick={copyRoomId}>
          <div className="px-3 py-1 bg-gray-700 rounded-lg flex items-center space-x-2 cursor-pointer hover:bg-gray-600 transition-colors">
            <span className="text-sm font-medium text-gray-300 truncate max-w-xs">{roomId}</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Video Grid */}
      <div className="flex-1 bg-gray-900 p-4 overflow-auto">
        <div className={`grid ${getGridClass()} gap-4 auto-rows-fr`}>
          {/* Local Video */}
          <div className="relative rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center aspect-video">
            <video 
              ref={localVideoRef}
              autoPlay 
              muted 
              playsInline 
              className={`w-full h-full object-cover ${isVideoOff ? 'invisible' : ''}`}
            />
            {isVideoOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded-md text-sm text-white">
              You
            </div>
          </div>
          
          {/* Remote Videos */}
          {Object.entries(peers).map(([userId, stream], index) => (
            <div key={userId} className="relative rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center aspect-video">
              <video
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                ref={(el) => {
                  if (el) el.srcObject = stream;
                }}
              />
              <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 px-2 py-1 rounded-md text-sm text-white">
                Participant {index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Control Bar */}
      <div className="bg-gray-800 p-4">
        <div className="flex items-center justify-center space-x-4">
          <button 
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center ${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'} transition-colors`}
          >
            {isMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>
          
          <button 
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center ${isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'} transition-colors`}
          >
            {isVideoOff ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          
          <button 
            onClick={leaveRoom}
            className="w-12 h-12 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l4 4m0 0l-4 4m4-4H4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Room;