/**
 * Codetorch Network Engine (ct-net)
 * Path: /src/system/ct-net.js
 * License: GNU GPL v3
 */

export class CTNet {
  constructor(bus) {
    this.bus = bus || (typeof window !== "undefined" ? window.CTBus : null);
    this.peerConnections = new Map();
    this.websocketProxy = null;
    this.iceServers = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ];

    if (this.bus) {
      this.bindBusEvents();
    }
  }

  /**
   * Listens for IPC network requests from WASI workers or CLI utilities.
   */
  bindBusEvents() {
    this.bus.on("net:connect_ws", (payload) => this.connectWebSocketProxy(payload.url));
    this.bus.on("net:create_p2p", (payload) => this.initP2PConnection(payload.peerId));
    this.bus.on("net:send_p2p", (payload) => this.sendP2PData(payload.peerId, payload.data));
  }

  /**
   * Establishes a WebSocket proxy bridge for POSIX TCP socket abstraction.
   */
  connectWebSocketProxy(url) {
    console.log(`[ct-net] Connecting WebSocket proxy to ${url}...`);

    try {
      this.websocketProxy = new WebSocket(url);
      this.websocketProxy.binaryType = "arraybuffer";

      this.websocketProxy.onopen = () => {
        console.log("[ct-net] WebSocket socket proxy connected.");
        if (this.bus) {
          this.bus.emit("net:ws_status", { status: "connected", url });
        }
      };

      this.websocketProxy.onmessage = (event) => {
        if (this.bus) {
          this.bus.emit("net:data_received", { data: event.data });
        }
      };

      this.websocketProxy.onerror = (err) => {
        console.error("[ct-net] WebSocket proxy error:", err);
        if (this.bus) {
          this.bus.emit("net:ws_status", { status: "error", error: err.message });
        }
      };

      this.websocketProxy.onclose = () => {
        console.log("[ct-net] WebSocket proxy connection closed.");
        if (this.bus) {
          this.bus.emit("net:ws_status", { status: "closed" });
        }
      };
    } catch (err) {
      console.error("[ct-net] WebSocket initialization failed:", err);
    }
  }

  /**
   * Initializes WebRTC Peer-to-Peer data connection for mesh networking.
   */
  async initP2PConnection(peerId) {
    console.log(`[ct-net] Initializing WebRTC Peer Connection with ${peerId}...`);

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const dataChannel = pc.createDataChannel("ct-mesh-channel");

    dataChannel.onopen = () => {
      console.log(`[ct-net] Data channel open with peer ${peerId}`);
      if (this.bus) {
        this.bus.emit("net:p2p_status", { peerId, status: "connected" });
      }
    };

    dataChannel.onmessage = (event) => {
      if (this.bus) {
        this.bus.emit("net:p2p_data", { peerId, data: event.data });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.bus) {
        this.bus.emit("net:ice_candidate", { peerId, candidate: event.candidate });
      }
    };

    this.peerConnections.set(peerId, { pc, dataChannel });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (this.bus) {
      this.bus.emit("net:offer_created", { peerId, offer });
    }
  }

  /**
   * Sends binary or string data over established WebRTC data channel.
   */
  sendP2PData(peerId, data) {
    const peer = this.peerConnections.get(peerId);
    if (peer && peer.dataChannel && peer.dataChannel.readyState === "open") {
      peer.dataChannel.send(data);
    } else {
      console.warn(`[ct-net] Cannot send data: Peer '${peerId}' is not connected.`);
    }
  }
}
