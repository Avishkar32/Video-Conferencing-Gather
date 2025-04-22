import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";

const socket = io.connect("https://video-conferencing-gather.vercel.app/");

const VideoCall = () => {
  const [me, setMe] = useState("");
  const [stream, setStream] = useState();
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState();
  const [callAccepted, setCallAccepted] = useState(false);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        setStream(stream);
        myVideo.current.srcObject = stream;
      });

    socket.on("me", (id) => {
      console.log("My socket ID:", id); // Add logging
      setMe(id);
    });

    socket.on("callUser", ({ from, name: callerName, signal }) => {
      setReceivingCall(true);
      setCaller(from);
      setCallerSignal(signal);
    });
  }, []);

  const callUser = (id) => {
    console.log("Calling user with ID:", id); // Add logging
    console.log("My ID (from):", me); // Add logging
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on("signal", (data) => {
      socket.emit("callUser", {
        userToCall: id,
        signalData: data,
        from: me, // Ensure 'from' field is set
      });
    });

    peer.on("stream", (userStream) => {
      userVideo.current.srcObject = userStream;
    });

    socket.on("callAccepted", (signal) => {
      setCallAccepted(true);
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
    console.log("Answering call from:", caller); // Add logging
    console.log("My ID (to):", me); // Add logging
    setCallAccepted(true);
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (data) => {
      socket.emit("answerCall", { signal: data, to: caller }); // Ensure 'to' field is set
    });

    peer.on("stream", (userStream) => {
      userVideo.current.srcObject = userStream;
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  return (
    <div>
      <h1>Video Call App</h1>
      <div>
        <video ref={myVideo} autoPlay playsInline style={{ width: "300px" }} />
        {callAccepted && <video ref={userVideo} autoPlay playsInline style={{ width: "300px" }} />}
      </div>
      <div>
        {receivingCall && !callAccepted ? (
          <button onClick={answerCall}>Answer Call</button>
        ) : (
          <button onClick={() => callUser(prompt("Enter User ID to call"))}>
            Call User
          </button>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
