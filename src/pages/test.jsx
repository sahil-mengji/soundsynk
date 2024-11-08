import React, { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import Peer from "peerjs";

const WebRTCAudioShare = () => {
	const [isHost, setIsHost] = useState(false);
	const [peerId, setPeerId] = useState("");
	const [connections, setConnections] = useState([]);
	const [isSharing, setIsSharing] = useState(false);
	const [audioSource, setAudioSource] = useState("microphone"); // 'microphone' or 'system'
	const localAudioRef = useRef(null);
	const remoteAudioRef = useRef(null);
	const peerRef = useRef(null);
	const canvasRef = useRef(null);
	const audioContextRef = useRef(null);
	const analyserRef = useRef(null);

	useEffect(() => {
		peerRef.current = new Peer();

		peerRef.current.on("open", (id) => {
			setPeerId(id);
		});

		peerRef.current.on("connection", (conn) => {
			handleConnection(conn);
		});

		peerRef.current.on("call", (call) => {
			call.answer(); // Answer the call with an empty stream

			call.on("stream", (remoteStream) => {
				// Set the remote stream to the audio element
				remoteAudioRef.current.srcObject = remoteStream;
			});

			call.on("error", (err) => {
				console.error("Call error:", err);
			});
		});

		peerRef.current.on("error", (err) => {
			console.error("PeerJS error:", err);
		});

		return () => {
			if (peerRef.current) {
				peerRef.current.destroy();
			}
		};
	}, []);

	const handleConnection = (conn) => {
		conn.on("open", () => {
			setConnections((prevConnections) => [...prevConnections, conn]);
		});

		conn.on("close", () => {
			setConnections((prevConnections) =>
				prevConnections.filter((c) => c.peer !== conn.peer)
			);
		});

		conn.on("error", (err) => {
			console.error("Connection error:", err);
		});
	};

	const startSharing = async () => {
		try {
			let stream;
			if (audioSource == "microphone") {
				stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			} else {
				stream = await navigator.mediaDevices.getDisplayMedia({
					audio: true, // Capture system audio
					video: true, // No need for video
				});
			}

			localAudioRef.current.srcObject = stream;

			// Setup audio visualization
			setupAudioVisualization(stream);

			connections.forEach((conn) => {
				const call = peerRef.current.call(conn.peer, stream);
				call.on("error", (err) => {
					console.error("Call error:", err);
				});
			});

			setIsSharing(true);
		} catch (error) {
			console.error("Error accessing audio:", error);
		}
	};

	const stopSharing = () => {
		if (localAudioRef.current && localAudioRef.current.srcObject) {
			localAudioRef.current.srcObject
				.getTracks()
				.forEach((track) => track.stop());
		}
		setIsSharing(false);
	};

	const connectToPeer = (peerId) => {
		const conn = peerRef.current.connect(peerId);
		handleConnection(conn);
	};

	const toggleSharing = () => {
		if (isSharing) {
			stopSharing();
		} else {
			startSharing();
		}
	};

	const setupAudioVisualization = (stream) => {
		audioContextRef.current = new (window.AudioContext ||
			window.webkitAudioContext)();
		const source = audioContextRef.current.createMediaStreamSource(stream);
		analyserRef.current = audioContextRef.current.createAnalyser();
		source.connect(analyserRef.current);
		analyserRef.current.fftSize = 2048;
		const bufferLength = analyserRef.current.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);

		const canvas = canvasRef.current;
		const canvasCtx = canvas.getContext("2d");

		const draw = () => {
			requestAnimationFrame(draw);

			analyserRef.current.getByteTimeDomainData(dataArray);

			canvasCtx.fillStyle = "rgb(200, 200, 200)";
			canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

			canvasCtx.lineWidth = 2;
			canvasCtx.strokeStyle = "rgb(0, 0, 0)";

			canvasCtx.beginPath();

			const sliceWidth = (canvas.width * 1.0) / bufferLength;
			let x = 0;

			for (let i = 0; i < bufferLength; i++) {
				const v = dataArray[i] / 128.0;
				const y = (v * canvas.height) / 2;

				if (i === 0) {
					canvasCtx.moveTo(x, y);
				} else {
					canvasCtx.lineTo(x, y);
				}

				x += sliceWidth;
			}

			canvasCtx.lineTo(canvas.width, canvas.height / 2);
			canvasCtx.stroke();
		};

		draw();
	};

	return (
		<div className="p-4">
			<h1 className="text-2xl font-bold mb-4">WebRTC Audio Sharing</h1>

			<div className="mb-4">
				<button
					onClick={() => setIsHost(!isHost)}
					className="bg-blue-500 text-white px-4 py-2 rounded"
				>
					{isHost ? "Switch to Client" : "Switch to Host"}
				</button>
			</div>

			{isHost ? (
				<div>
					<h2 className="text-xl font-semibold mb-2">Host Mode</h2>
					<p>Your Peer ID: {peerId}</p>
					<div className="my-4">
						<QRCodeSVG value={peerId} size={200} />
					</div>

					<div className="mb-4">
						<label className="block text-lg font-medium">
							Choose Audio Source:
						</label>
						<select
							value={audioSource}
							onChange={(e) => setAudioSource(e.target.value)}
							className="p-2 border rounded"
						>
							<option value="microphone">Microphone Audio</option>
							<option value="system">System Audio</option>
						</select>
					</div>

					<button
						onClick={toggleSharing}
						className={`px-4 py-2 rounded ${
							isSharing ? "bg-red-500" : "bg-green-500"
						} text-white`}
					>
						{isSharing ? "Stop Sharing Audio" : "Start Sharing Audio"}
					</button>
					<audio ref={localAudioRef} muted />
					<canvas ref={canvasRef} width="600" height="100" className="mt-4" />
					<div className="mt-4">
						<h3 className="text-lg font-semibold">Connected Devices:</h3>
						<ul>
							{connections.map((conn, index) => (
								<li key={index}>{conn.peer}</li>
							))}
						</ul>
					</div>
				</div>
			) : (
				<div>
					<h2 className="text-xl font-semibold mb-2">Client Mode</h2>
					<input
						type="text"
						placeholder="Enter Host Peer ID"
						className="border p-2 mr-2"
						onChange={(e) => setPeerId(e.target.value)}
					/>
					<button
						onClick={() => connectToPeer(peerId)}
						className="bg-green-500 text-white px-4 py-2 rounded"
					>
						Connect
					</button>
					<audio ref={remoteAudioRef} autoPlay controls />
				</div>
			)}
		</div>
	);
};

export default WebRTCAudioShare;
