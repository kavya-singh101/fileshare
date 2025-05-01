import React, { useContext, useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { io } from "socket.io-client";
import { useParams, useNavigate } from 'react-router-dom'
import userContext from "../context/user/userContext";
import ClassesContext from "../context/classes/classesContext";
import axios from "axios";
import './styles/main.css';
import './styles/room.css';
import { MdAddComment } from 'react-icons/md';

const Room = () => {
  const APP_ID = "53bd41defce64a9eb9b17038c118ed3f";
  const id = localStorage.getItem('display_name');
  const [userDetails, setUserDetails] = useState({});


  const { checkRefreshToken, userDetail } = useContext(userContext);

  let navigate = useNavigate();
  const checkAndRefreshToken = async () => {

    const accessToken = localStorage.getItem("accessToken");
    if (!id) {
      navigate('/lobby'); // Use navigate instead of window.location
      return;
    }
    if (accessToken && accessToken !== undefined) {
      await userDetail();
      return;
    }
    await checkRefreshToken();
  };

  const hasRun = useRef(false);
  const hasJoined = useRef(false);
  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      checkAndRefreshToken();
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const getUserInfo = async () => {
      try {
        const info = await userDetail();
        setUserDetails(info);
      } catch (error) {
        console.error('Error getting user info:', error);
      }
    };
    getUserInfo();
  }, []);

  const [roomId] = useState(() => {
    const urlParam = new URLSearchParams(window.location.search);
    let storedRoomId = urlParam.get('room') || "main";
    sessionStorage.setItem("roomId", storedRoomId);
    return storedRoomId;
  });

  const [profileImage, setProfileImage] = useState(id?.avatar);
  // const [displayName, setdisplayName] = useState(id?.fullname);

  // const displayName = localStorage.getItem('display_name');

  const socketRef = useRef(null);
  const [messages, setMessages] = useState([]);

  const streamsContainerRef = useRef(null);
  const displayFrameRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const memberContainerRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [client] = useState(AgoraRTC.createClient({ mode: "rtc", codec: "vp8" }));
  const localTracksRef = useRef([]);
  const remoteUsersRef = useRef({});
  const localScreenTrackRef = useRef(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [activeMemberContainer, setActiveMemberContainer] = useState(false);
  const [activeChatContainer, setActiveChatContainer] = useState(false);
  const [userIdInDisplayFrame, setUserIdInDisplayFrame] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);

  const [chatInput, setChatInput] = useState("");
  const messagesEndRef = useRef(null);

  const fetchMultipleUserDetails = async (userIds) => {
    try {
      const accessToken = localStorage.getItem("accessToken");
      console.log("Fetching details for user IDs:", userIds);

      const response = await fetch(`http://localhost:3000/api/v1/users/getMultipleUsers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userIds: userIds
        })
      });

      console.log("Response status:", response.status);
      const responseData = await response.json();
      console.log("Full response data:", responseData);

      if (response.ok && responseData.success) {
        const usersData = responseData.data;
        console.log("Users data received:", usersData);

        // Update userDetails state with all received user data
        setUserDetails(prev => ({
          ...prev,
          ...usersData
        }));
        return usersData;
      } else {
        console.error("Error response:", responseData);
        return null;
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      return null;
    }
  };


  useEffect(() => {

    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }

    const joinRoomInit = async () => {
      if (hasJoined.current) return;
      try {
        await console.log(`idd--------------------->${id}`)
        await client.join(APP_ID, roomId, null, id);
        client.on('user-published', handleUserPublished);
        client.on('user-left', handleUserLeft);
        await joinStream();
      } catch (error) {
        console.error('Error joining room:', error);
      }
    };

    joinRoomInit();

    return () => {
      localTracksRef.current.forEach(track => track && track.close());
      client.leave();
    };


  }, [client, roomId, id]);

  useEffect(() => {
    if (displayFrameRef.current) {
      displayFrameRef.current.addEventListener('click', hideDisplayFrame);
    }

    return () => {
      if (displayFrameRef.current) {
        displayFrameRef.current.removeEventListener('click', hideDisplayFrame);
      }
    };
  }, []);

  const joinStream = async () => {
    try {
      const localTracks = await AgoraRTC.createMicrophoneAndCameraTracks({}, {
        encoderConfig: {
          width: { min: 640, ideal: 1920, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
        },
      });
      localTracksRef.current = localTracks;
      console.log("user id", id);
      addVideoPlayer(id);
      await addMemberList(id);
      localTracks[1].play(`user-${id}`);
      await client.publish(localTracks);
    } catch (error) {
      console.error('Error joining stream:', error);
    }
  };

  const addVideoPlayer = (userId) => {
    if (!streamsContainerRef.current) return;

    const playerHTML = `
      <div class="video__container" id="user-container-${userId}">
        <div class="video-player" id="user-${userId}"></div>
      </div>
    `;
    streamsContainerRef.current.insertAdjacentHTML('beforeend', playerHTML);
    document.getElementById(`user-container-${userId}`).addEventListener('click', expandVideoFrame);
  };

  // ------------------------------------------------------------------------------------
  const addMemberList = async (userId) => {
    if (!memberContainerRef.current) return;

    console.log("Adding member:", userId);
    console.log("Current userDetails state:", userDetails);

    // Get all current user IDs that need details
    const userIdsToFetch = [userId];
    if (!userDetails[userId]) {
      const fetchedData = await fetchMultipleUserDetails(userIdsToFetch);
      console.log("Fetched data for user:", fetchedData);
    }

    // Get the fullname from userDetails or use a default
    const userData = userDetails[userId];
    console.log("User data for display:", userData);
    const fullname = userData?.fullname || userId;
    console.log("Final fullname to display:", fullname);

    const memberHTML = `
      <div class="member__wrapper" id="member__${userId}__wrapper">
        <span class="green__icon"></span>
        <p class="member_name">${fullname}</p>
      </div>
    `;

    const memberList = memberContainerRef.current.querySelector('#member__list');
    if (memberList) {
      // Remove existing member if present
      const existingMember = document.getElementById(`member__${userId}__wrapper`);
      if (existingMember) {
        existingMember.remove();
      }
      memberList.insertAdjacentHTML('beforeend', memberHTML);
    }

    // Update room members state
    setRoomMembers(prev => [...prev, userId]);
  };

  const removeMemberList = (userId) => {
    const memberElement = document.getElementById(`member__${userId}__wrapper`);
    if (memberElement) {
      memberElement.remove();
    }

    // Update room members state
    setRoomMembers(prev => prev.filter(member => member !== userId));
  };

  const switchToCamera = async () => {
    try {
      addVideoPlayer(id);
      await localTracksRef.current[1].setMuted(true);
      document.getElementById('camera-btn').classList.remove('active');
      localTracksRef.current[1].play(`user-${id}`);
      await client.publish([localTracksRef.current[1]]);
    } catch (error) {
      console.error('Error switching to camera:', error);
    }
  };

  const handleUserPublished = async (user, mediaType) => {
    remoteUsersRef.current[user] = user.uid;
    await client.subscribe(user, mediaType);
    console.log("User published:", user);

    const actualUserId = user.uid; // Use uid if available, otherwise fallback to id


    if (!document.getElementById(`user-container-${user.uid}`)) {
      addVideoPlayer(user.uid);
    }

    if (!document.getElementById(`member__${actualUserId}__wrapper`)) {
      await addMemberList(actualUserId);
    }

    if (displayFrameRef.current?.style.display === 'block') {
      const videoFrame = document.getElementById(`user-container-${user.uid}`);
      if (videoFrame) {
        videoFrame.style.height = '100px';
        videoFrame.style.width = '100px';
      }
    }

    if (mediaType === 'video') {
      user.videoTrack.play(`user-${user.uid}`);
    }
    if (mediaType === 'audio') {
      user.audioTrack.play();
    }
  };

  const handleUserLeft = (user) => {
    delete remoteUsersRef.current[user.uid];
    const userContainer = document.getElementById(`user-container-${user.uid}`);
    if (userContainer) userContainer.remove();

    removeMemberList(actualUserId);
    if (userIdInDisplayFrame === `user-container-${user.uid}`) {
      hideDisplayFrame();
    }
  };

  const toggleCamera = async () => {
    const button = document.getElementById('camera-btn');
    const videoTrack = localTracksRef.current[1];
    if (!videoTrack) return;

    if (videoTrack.muted) {
      await videoTrack.setMuted(false);
      button.classList.add('active');
    } else {
      await videoTrack.setMuted(true);
      button.classList.remove('active');
    }
  };

  const toggleMic = async () => {
    const button = document.getElementById('mic-btn');
    const audioTrack = localTracksRef.current[0];
    if (!audioTrack) return;

    if (audioTrack.muted) {
      await audioTrack.setMuted(false);
      button.classList.add('active');
    } else {
      await audioTrack.setMuted(true);
      button.classList.remove('active');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const socket = io("http://localhost:3000", {
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to socket:", socket.id);
      socket.emit("joinClass", roomId);
    });

    // Listen for incoming new messages and update the messages state
    socket.on("newMessage", (message) => {
      console.log("Received new message:", message); // Debug log to see if it's being received
      setMessages((prevMessages) => [...prevMessages, message]); // Add new message to state
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const toggleScreen = async () => {
    const screenButton = document.getElementById('screen-btn');
    const cameraButton = document.getElementById('camera-btn');

    if (!sharingScreen) {
      try {
        setSharingScreen(true);
        screenButton.classList.add('active');
        // cameraButton.classList.add('inactive');
        // cameraButton.style.display = 'none';

        // toggleCamera();
        // const videoTrack = localTracksRef.current[1];
        // await videoTrack.setMuted(true);
        // button.classList.remove('active');

        localScreenTrackRef.current = await AgoraRTC.createScreenVideoTrack();
        document.getElementById(`user-container-${id}`)?.remove();

        addVideoPlayer(id);
        setUserIdInDisplayFrame(`user-container-${id}`);

        localScreenTrackRef.current.play(`user-${id}`);
        await client.unpublish([localTracksRef.current[1]]);
        await client.publish([localScreenTrackRef.current]);

        const videoFrames = document.getElementsByClassName('video__container');
        Array.from(videoFrames).forEach((frame) => {
          if (frame.id !== userIdInDisplayFrame) {
            frame.style.height = '100px';
            frame.style.width = '100px';
          }
        });
      } catch (error) {
        console.error('Error sharing screen:', error);
        setSharingScreen(false);
      }
    } else {
      // button.classList.add('active');
      setSharingScreen(false);
      cameraButton.style.display = 'block';
      screenButton.classList.remove('active');
      document.getElementById(`user-container-${id}`)?.remove();

      await client.unpublish([localScreenTrackRef.current]);
      localScreenTrackRef.current = null;
      switchToCamera();
    }
  };

  const handleMemberButtonClick = () => {
    setActiveMemberContainer(prev => !prev);
  };

  const handleChatButtonClick = () => {
    setActiveChatContainer(prev => !prev);
  };

  const expandVideoFrame = (event) => {
    const videoElement = event.currentTarget;

    if (displayFrameRef.current && streamsContainerRef.current) {
      const child = displayFrameRef.current.children[0];
      if (child) {
        streamsContainerRef.current.appendChild(child);
      }

      displayFrameRef.current.style.display = 'block';
      displayFrameRef.current.appendChild(videoElement);
      setUserIdInDisplayFrame(videoElement.id);

      const videoFrames = streamsContainerRef.current.getElementsByClassName('video__container');
      Array.from(videoFrames).forEach(frame => {
        if (frame.id !== videoElement.id) {
          frame.style.height = '100px';
          frame.style.width = '100px';
        }
      });
    }
  };

  const hideDisplayFrame = () => {
    if (displayFrameRef.current && streamsContainerRef.current) {
      setUserIdInDisplayFrame(null);
      displayFrameRef.current.style.display = 'none';

      const child = displayFrameRef.current.children[0];
      if (child) {
        streamsContainerRef.current.appendChild(child);
      }

      const videoFrames = streamsContainerRef.current.getElementsByClassName('video__container');
      Array.from(videoFrames).forEach(frame => {
        frame.style.height = '300px';
        frame.style.width = '300px';
      });
    }
  };

  const fetchClassData = async () => {
    try {
      const res = await axios.get(`http://localhost:3000/api/v1/users/classes/${classId}/members`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (res.data?.data) {
        setClassData(res.data.data);
        setMembers(res.data.data.students || []);
        setOwner(res.data.data.owner || null);

      }
    } catch (err) {
      console.error("Error fetching class data:", err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      await sendMessage();
    }
  };

  const sendMessage = async () => {
    try {
      const messagePayload = {
        text: chatInput.trim(),
        id,
        classId,
        createdAt: new Date(),
      };

      // Send HTTP POST request to save message
      const res = await fetch(`http://localhost:3000/api/v1/messages/${roomId}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify({ text: chatInput.trim() }),
      });

      const message = await res.json();

      // Emit the socket event with message.data
      if (socketRef.current) {
        socketRef.current.emit("sendMessage", message);
      }

      setChatInput(""); // Clear input
    } catch (err) {
      console.error("Error sending message:", err);
    }

  };

  const getMessages = async () => {
    try {
      const res = await fetch(`http://localhost:3000/api/v1/messages/${roomId}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });
      const data = await res.json();
      setMessages(data); // ✅ directly set the array
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  };

  useEffect(() => {
    if (roomId) {
      getMessages();
    }
  }, [roomId]);

  const handleLeave = async () => {
    await client.leave();
    localTracksRef.current.forEach(track => track && track.close());
    navigate('/lobby'); // Use navigate instead of window.location
  };

  return (
    <>
      <header id="nav">
        <div className="nav--list">
          <button id="members__button" onClick={handleMemberButtonClick}>
            <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" fillRule="evenodd" clipRule="evenodd">
              <path d="M24 18v1h-24v-1h24zm0-6v1h-24v-1h24zm0-6v1h-24v-1h24z" fill="#ede0e0" />
              <path d="M24 19h-24v-1h24v1zm0-6h-24v-1h24v1zm0-6h-24v-1h24v1z" />
            </svg>
          </button>
          <a href="/">
            <h3 id="logo">
              {/* <img src="..\assets\images\logo.png" alt="Site Logo" /> */}
              <span>StuMeet</span>
            </h3>
          </a>
        </div>

        <div id="nav__links">
          <button id="chat__button" onClick={handleChatButtonClick}>
            <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" fillRule="evenodd" fill="#ede0e0" clipRule="evenodd">
              <path d="M24 20h-3v4l-5.333-4h-7.667v-4h2v2h6.333l2.667 2v-2h3v-8.001h-2v-2h4v12.001zm-15.667-6l-5.333 4v-4h-3v-14.001l18 .001v14h-9.667zm-6.333-2h3v2l2.667-2h8.333v-10l-14-.001v10.001z" />
            </svg>
          </button>

        </div>
      </header>

      <main className="container">
        <div id="room__container">
          <section id="members__container" ref={memberContainerRef} className={activeMemberContainer ? 'active' : ''}>
            <div id="members__header">
              <p>Participants</p>
              <strong id="members__count">{roomMembers.length}</strong>
            </div>
            <div id="member__list">
              {/* <div className="member__wrapper" id="member__1__wrapper">
                <span className="green__icon"></span>
                <p className="member_name">Sulammita</p>
              </div>
              <div className="member__wrapper" id="member__2__wrapper">
                <span className="green__icon"></span>
                <p className="member_name">Dennis Ivy</p>
              </div>
              <div className="member__wrapper" id="member__3__wrapper">
                <span className="green__icon"></span>
                <p className="member_name">Shahriar P. Shuvo 👋</p>
              </div> */}
            </div>
          </section>

          <section id="stream__container">
            <div id="stream__box" ref={displayFrameRef}></div>
            <div id="streams__container" ref={streamsContainerRef}></div>
            <div className="stream__actions">
              <button id="camera-btn" className="active" onClick={toggleCamera}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                  <path d="M5 4h-3v-1h3v1zm10.93 0l.812 1.219c.743 1.115 1.987 1.781 3.328 1.781h1.93v13h-20v-13h3.93c1.341 0 2.585-.666 3.328-1.781l.812-1.219h5.86zm1.07-2h-8l-1.406 2.109c-.371.557-.995.891-1.664.891h-5.93v17h24v-17h-3.93c-.669 0-1.293-.334-1.664-.891l-1.406-2.109zm-11 8c0-.552-.447-1-1-1s-1 .448-1 1 .447 1 1 1 1-.448 1-1zm7 0c1.654 0 3 1.346 3 3s-1.346 3-3 3-3-1.346-3-3 1.346-3 3-3zm0-2c-2.761 0-5 2.239-5 5s2.239 5 5 5 5-2.239 5-5-2.239-5-5-5z" />
                </svg>
              </button>
              <button id="mic-btn" className="active" onClick={toggleMic}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                  <path d="M12 2c1.103 0 2 .897 2 2v7c0 1.103-.897 2-2 2s-2-.897-2-2v-7c0-1.103.897-2 2-2zm0-2c-2.209 0-4 1.791-4 4v7c0 2.209 1.791 4 4 4s4-1.791 4-4v-7c0-2.209-1.791-4-4-4zm8 9v2c0 4.418-3.582 8-8 8s-8-3.582-8-8v-2h2v2c0 3.309 2.691 6 6 6s6-2.691 6-6v-2h2zm-7 13v-2h-2v2h-4v2h10v-2h-4z" />
                </svg>
              </button>
              <button id="screen-btn" onClick={toggleScreen}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                  <path d="M0 1v17h24v-17h-24zm22 15h-20v-13h20v13zm-6.599 4l2.599 3h-12l2.599-3h6.802z" />
                </svg>
              </button>
              <button id="leave-btn" onClick={handleLeave}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                  <path d="M16 10v-5l8 7-8 7v-5h-8v-4h8zm-16-8v20h14v-2h-12v-16h12v-2h-14z" />
                </svg>
              </button>
            </div>
          </section>

          <section id="messages__container" ref={chatContainerRef} className={activeChatContainer ? 'active' : ''}>
            <div id="messages" ref={messagesContainerRef}>
              {Array.isArray(messages) && messages.length === 0 ? (
                <div className="message__wrapper">
                  <div className="message__body__bot">
                    <strong className="message__author__bot">🤖 Bot</strong>
                    <p className="message__text__bot">No messages yet. Start the conversation!</p>
                  </div>
                </div>
              ) : (
                messages?.map((msg, index) => (
                  <div key={index} className="message__wrapper">
                    <div className="message__body">
                      <strong className="message__author">{msg.senderId?.username || "Unknown"}</strong>
                      <p className="message__text">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <form id="message__form" onSubmit={handleSendMessage}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type your message..."
                className="input input-bordered w-full"
              />
              <button type="submit" className="btn btn-primary">Send</button>
            </form>
          </section>
        </div>
      </main>
    </>
  );
};

export default Room;
