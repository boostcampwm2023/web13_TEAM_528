import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const VideoCall = () => {
  const socketRef = useRef<Socket>();
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection>();

  const startButtonRef = useRef<HTMLButtonElement>(null);
  const callButtonRef = useRef<HTMLButtonElement>(null);
  const hangupButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {}, []);

  // TODO: 발표자 브라우저에서 미디어 track 설정 & 화면에 영상 출력
  const start = async () => {
    try {
      socketRef.current = io("http://localhost:3000/create-room");

      //startButton.disabled = true;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });

      //localVideo.srcObject = stream;
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
      }

      //callButton.disabled = false;
      console.log("1. 로컬 stream 생성 완료");

      //presenterRTCPC = new RTCPeerConnection();
      pcRef.current = new RTCPeerConnection();

      console.log("2. 로컬 RTCPeerConnection 생성 완료");
      if (stream) {
        console.log(stream);
        console.log("3.track 추가");
        stream.getTracks().forEach((track) => {
          console.log("track:", track);
          if (!pcRef.current) return;
          pcRef.current.addTrack(track, stream);
        });
      } else {
        console.log("no stream");
      }
    } catch (e) {
      alert(`getUserMedia() error: ${e.name}`);
    }
  };

  async function setStream() {
    console.log("4.setstream 실행");
    try {
      await createPresenterOffer();
      await setServerAnswer();
    } catch (e) {
      console.log(e);
    }
  }

  start().then(setStream);

  function getPresenterCandidate() {
    if (!pcRef.current) return;
    pcRef.current.onicecandidate = (e) => {
      if (e.candidate) {
        if (!socketRef.current) return;
        console.log("발표자 candidate 수집");
        socketRef.current.emit("presenterCandidate", {
          candidate: e.candidate,
          presenterSocketId: socketRef.current.id
        });
      }
    };
  }

  async function createPresenterOffer() {
    try {
      if (!pcRef.current || !socketRef.current) return;
      console.log("offer 생성");
      //console.log(pcRef.current);
      const SDP = await pcRef.current.createOffer();
      //console.log(pcRef.current);
      // presenterRTCPC.ontrack((e) => {
      //   console.log(e.streams)
      // })
      socketRef.current.emit("presenterOffer", {
        socketId: socketRef.current.id,
        SDP: SDP
      });
      console.log("발표자 localDescription 설정 완료");
      pcRef.current.setLocalDescription(SDP);
      // presenterRTCPC.setLocalDescription(new RTCSessionDescription(SDP))
      getPresenterCandidate();
    } catch (e) {
      console.log(e);
    }
  }

  async function setServerAnswer() {
    if (!socketRef.current) return;
    socketRef.current.on(`${socketRef.current.id}-serverAnswer`, (data) => {
      if (!pcRef.current) return;
      console.log("remoteDescription 설정완료");
      pcRef.current.setRemoteDescription(data.SDP);
    });
    socketRef.current.on(`${socketRef.current.id}-serverCandidate`, (data) => {
      if (!pcRef.current) return;
      console.log("서버로부터 candidate 받음");
      pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
  }

  return (
    <div>
      <video
        id="remotevideo"
        style={{
          width: 240,
          height: 240,
          backgroundColor: "black"
        }}
        ref={myVideoRef}
        autoPlay
        muted
      />

      <div>
        <button className="border" ref={startButtonRef}>
          시작
        </button>
        <button className="border" id="callButton" ref={callButtonRef}>
          방 생성
        </button>
        <button className="border" id="hangupButton" ref={hangupButtonRef}>
          방 나가기
        </button>
      </div>
    </div>
  );
};

export default VideoCall;
