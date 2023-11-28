import { Server, Socket } from 'socket.io';
import { RTCIceCandidate, RTCPeerConnection } from 'wrtc';
import { pc_config } from './pc.config';
import { RoomInfo } from './models/RoomInfo';
import { ClientInfo, ClientType } from './models/ClientInfo';
import { Message } from './models/Message';

export class RelayServer {
  private readonly io;
  private readonly roomsInfo: Map<string, RoomInfo>;
  private readonly clientsInfo: Map<string, ClientInfo>;

  constructor(port: number) {
    this.roomsInfo = new Map();
    this.clientsInfo = new Map();
    // this.presentersInfo = new Map();
    // this.studentsInfo = new Map();
    this.io = new Server(port, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
  }

  listen = (path: string, event: string, method: (socket: Socket) => void) => {
    this.io.of(path).on(event, method);
  };

  createRoom = (socket: Socket) => {
    try {
      socket.on('presenterOffer', async (data) => {
        const RTCPC = new RTCPeerConnection(pc_config);
        this.clientsInfo.set(socket.id, new ClientInfo(ClientType.PRESENTER, RTCPC));
        this.roomsInfo.set(data.roomId, new RoomInfo(socket.id, RTCPC));
        RTCPC.ontrack = (event) => {
          const roomInfo = this.roomsInfo.get(data.roomId);
          if (roomInfo) {
            roomInfo.stream = event.streams[0];
          }
        };

        socket.join(socket.id);
        this.exchangeCandidate('/create-room', socket);

        await RTCPC.setRemoteDescription(data.SDP);
        const SDP = await RTCPC.createAnswer();
        this.io.of('/create-room').to(socket.id).emit('serverAnswer', {
          SDP: SDP
        });
        RTCPC.setLocalDescription(SDP);

        const clientInfo = this.clientsInfo.get(socket.id);
        if (!clientInfo) {
          throw new Error('발표자가 존재하지 않습니다.');
        }
        clientInfo.roomId = data.roomId;
        socket.join(data.roomId);
      });
    } catch (e) {
      console.log(e);
    }
  };

  enterRoom = (socket: Socket) => {
    try {
      socket.on('studentOffer', async (data) => {
        const RTCPC = new RTCPeerConnection(pc_config);
        this.clientsInfo.set(socket.id, new ClientInfo(ClientType.STUDENT, RTCPC));
        const presenterStream = this.roomsInfo.get(data.roomId)?.stream;
        if (!presenterStream) {
          return;
        }
        presenterStream.getTracks().forEach((track: any) => {
          RTCPC.addTrack(track);
        });

        socket.join(socket.id);
        this.exchangeCandidate('/enter-room', socket);

        await RTCPC.setRemoteDescription(data.SDP);
        const SDP = await RTCPC.createAnswer();
        this.io.of('/enter-room').to(socket.id).emit(`serverAnswer`, {
          SDP: SDP
        });
        RTCPC.setLocalDescription(SDP);

        const roomInfo = this.roomsInfo.get(data.roomId);
        const clientInfo = this.clientsInfo.get(socket.id);
        if (!clientInfo || !roomInfo) {
          throw new Error('발표자가 존재하지 않습니다.');
        }
        roomInfo.studentSocketList.push(socket.id);
        clientInfo.roomId = data.roomId;
        socket.join(data.roomId);
      });
    } catch (e) {
      console.log(e);
    }
  };

  lecture = (socket: Socket) => {
    const clientInfo = this.clientsInfo.get(socket.id);
    if (!clientInfo) {
      throw new Error('잘못된 사용자 입니다.');
    }
    socket.on('editBoard', (data) => {
      if (!clientInfo.roomId || clientInfo.type !== ClientType.PRESENTER) {
        throw new Error('해당 발표자가 존재하지 않습니다.');
      }
      this.io.of('/lecture').to(clientInfo.roomId).emit('edit', new Message('whiteBoard', data.content));
    });
    socket.on('question', (data) => {
      if (!clientInfo.roomId || clientInfo.type !== ClientType.STUDENT) {
        throw new Error('해당 참여자가 존재하지 않습니다.');
      }
      const presenterSocketId = this.roomsInfo.get(clientInfo.roomId)?.presenterSocketId;
      if (!presenterSocketId) {
        throw new Error('해당 방이 존재하지 않습니다');
      }
      this.io.of('/lecture').to(presenterSocketId).emit('question', new Message('question', data.content));
    });
  };

  exchangeCandidate = (namespace: string, socket: Socket) => {
    try {
      const RTCPC = this.clientsInfo.get(socket.id)?.RTCPC;
      if (!RTCPC) {
        console.log('Unable to exchange candidates');
        return;
      }
      RTCPC.onicecandidate = (e) => {
        if (e.candidate) {
          this.io.of(namespace).to(socket.id).emit(`serverCandidate`, {
            candidate: e.candidate
          });
        }
      };
      socket.on('clientCandidate', (data) => {
        RTCPC.addIceCandidate(new RTCIceCandidate(data.candidate));
      });
    } catch (e) {
      console.log(e);
    }
  };
}
