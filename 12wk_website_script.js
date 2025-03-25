const hostip = '192.168.8.104'; 
const port = '9012';

// Grab elements from the HTML page
nameInput = document.getElementById('nameInput');
connBtn = document.getElementById('connectButton');
fwdBtn = document.getElementById('UpButton');
lftBtn = document.getElementById('LeftButton');
rgtBtn = document.getElementById('RightButton');
statusText = document.getElementById('statusText');
xPos = document.getElementById('xPos');
yPos = document.getElementById('yPos');
zPos = document.getElementById('zPos');

// Grab the canvas element for IR sensor visualization
const sensorCanvas = document.getElementById('sensorCanvas');
const ctx = sensorCanvas.getContext('2d');

// Grab the timer display element
const timerDisplay = document.getElementById('timerDisplay');  // Add this line

// Global variables
let ros;
let cmdVel;
let forwardInterval, leftInterval, rightInterval;
let robPos;
let irData = [];
let timerInterval; 
let timerMilliseconds = 0; 

// Function to start the timer
function startTimer() {
  timerInterval = setInterval(() => {
    timerMilliseconds += 100; // Increment by 100 ms (0.1 second)
    let seconds = (timerMilliseconds / 1000).toFixed(2);
    timerDisplay.innerText = `Timer: ${seconds}s`;
  }, 100); 
}

// Function to stop the timer
function stopTimer() {
  clearInterval(timerInterval);
  // timerDisplay.innerText = 'Timer: 0.00s';
  timerMilliseconds = 0;
}


// Function to reset everything
function resetAll() {
  clearInterval(forwardInterval);
  clearInterval(leftInterval);
  clearInterval(rightInterval);

  var stopTwist = new ROSLIB.Message({
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 }
  });
  cmdVel.publish(stopTwist);

  xPos.innerText = '0.00';
  yPos.innerText = '0.00';  
  zPos.innerText = '0.00';

  statusText.innerText = "Disconnected";
  statusText.style.color = '#e61515';

  if (ros && ros.isConnected) {
    ros.close();
  }

  nameInput.value = '';
  robName = '';
  connBtn.innerText = "Connect";
}

// Connect/Disconnect button event listener
connBtn.addEventListener('click', function() {
  const robName = nameInput.value;

  if (ros && ros.isConnected) {
    console.log("Disconnecting from robot.");
    resetAll();
  } else {
    console.log("Connecting to robot:", robName);

    ros = new ROSLIB.Ros({
      url: `ws://${hostip}:${port}`
    });

    ros.on('connection', function() {
      console.log('Connected to websocket server.');
      statusText.innerText = "Connected";
      statusText.style.color = '#03B5AA';
      connBtn.innerText = "Disconnect";

      cmdVel = new ROSLIB.Topic({
        ros: ros,
        name: `/${robName}/cmd_vel`,
        messageType: 'geometry_msgs/Twist'
      });

      robPos = new ROSLIB.Topic({
        ros: ros,
        name: `/${robName}/odom`,
        messageType: 'nav_msgs/Odometry'
      });

      // Subscribe to the IR sensor data topic
      const irTopic = new ROSLIB.Topic({
        ros: ros,
        name: `/${robName}/ir_intensity`,
        messageType: 'irobot_create_msgs/IrIntensityVector'
      });

      irTopic.subscribe(function(message) {
        console.log('Full IR sensor message received:', message);
        irData = message.readings.map(reading => reading.value);
        console.log("Extracted IR data:", irData);
        drawIRData(irData);
      });
      
      robPos.subscribe(function(message) {
        console.log('Received odometry data:', message.pose.pose.position);
        xPos.innerText = message.pose.pose.position.x.toFixed(2);
        yPos.innerText = message.pose.pose.position.y.toFixed(2);
        zPos.innerText = message.pose.pose.position.z.toFixed(2);
      });
    });

    ros.on('error', function(error) {
      console.log('Error connecting to WebSocket:', error);
      statusText.innerText = "Connection Failed";
      statusText.style.color = '#e61515';
      connBtn.innerText = "Connect";
    });

    ros.on('close', function() {
      console.log('Connection to websocket server closed.');
      statusText.innerText = "Disconnected";
      statusText.style.color = '#e61515';
      connBtn.innerText = "Connect";
    });
  }
});

// Function to draw IR sensor data on the canvas
function drawIRData(irData) {
  ctx.clearRect(0, 0, sensorCanvas.width, sensorCanvas.height); // Clear canvas

  const centerX = sensorCanvas.width / 2;
  const centerY = sensorCanvas.height / 2;
  const robotRadius = Math.min(centerX, centerY) * 0.8; // Robot's body size
  const numSensors = irData.length;

  // Sensors only on the **front half** (180-degree spread)
  const angleStep = Math.PI / (numSensors - 1); // Divide front arc into equal angles
  const startAngle = -Math.PI / 2; // Start from the front center

  // Draw the robot body
  ctx.beginPath();
  ctx.arc(centerX, centerY, robotRadius, 0, 2 * Math.PI);
  ctx.fillStyle = "#333"; // Robot color
  ctx.fill();
  
  // Draw sensors along the front arc
  irData.forEach((value, index) => {
    const angle = startAngle + index * angleStep; // Position each sensor in the front arc
    const sensorX = centerX + robotRadius * Math.cos(angle);
    const sensorY = centerY + robotRadius * Math.sin(angle);

    // Normalize intensity (assuming 0-100 range)
    const intensity = Math.min(value / 100, 1);
    
    // Color gradient: Low (blue) → High (red)
    const red = Math.floor(intensity * 255);
    const blue = Math.floor((1 - intensity) * 255);
    const color = `rgb(${red}, 0, ${blue})`;

    // Sensor size based on intensity
    const sensorSize = 8 + intensity * 15; // Min 8px, max ~23px

    // Draw sensor as a filled circle
    ctx.beginPath();
    ctx.arc(sensorX, sensorY, sensorSize, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Optional: Add a glow effect
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(sensorX, sensorY, sensorSize * 1.5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // Draw a small reference dot at the robot center
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#FFF";
  ctx.fill();
}

// Forward movement
fwdBtn.addEventListener('mousedown', function() {
  forwardInterval = setInterval(function() {
    var twist = new ROSLIB.Message({
      linear: { x: 0.2, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 }
    });
    cmdVel.publish(twist);
  }, 100);
});

fwdBtn.addEventListener('mouseup', function() {
  clearInterval(forwardInterval);
  var twist = new ROSLIB.Message({
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 }
  });
  cmdVel.publish(twist);
});

// Left movement
lftBtn.addEventListener('mousedown', function() {
  leftInterval = setInterval(function() {
    var twist = new ROSLIB.Message({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0.4 }
    });
    cmdVel.publish(twist);
  }, 100);
});

lftBtn.addEventListener('mouseup', function() {
  clearInterval(leftInterval);
  var twist = new ROSLIB.Message({
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 }
  });
  cmdVel.publish(twist);
});

// Right movement
rgtBtn.addEventListener('mousedown', function() {
  rightInterval = setInterval(function() {
    var twist = new ROSLIB.Message({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: -0.4 }
    });
    cmdVel.publish(twist);
  }, 100);
});

rgtBtn.addEventListener('mouseup', function() {
  clearInterval(rightInterval);
  var twist = new ROSLIB.Message({
    linear: { x: 0, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 0 }
  });
  cmdVel.publish(twist);
});

// Event listener for the "Auto" button
autoButton.addEventListener('click', () => {
  startTimer();  
});

// Event listener for the "Manual" button
manualButton.addEventListener('click', () => {
  stopTimer();
});


