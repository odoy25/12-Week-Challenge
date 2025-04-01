const hostip = '192.168.8.104'; 
const port = '9012';

//////// INTIALIZATION STUFF /////////
var mode = 1; // 1 for manual, 2 for auto

// Grab elements from the HTML page
nameInput = document.getElementById('nameInput');
connBtn = document.getElementById('connectButton');
fwdBtn = document.getElementById('UpButton');
lftBtn = document.getElementById('LeftButton');
rgtBtn = document.getElementById('RightButton');
statusText = document.getElementById('statusText');

// Grab the canvas element for IR sensor visualization
const sensorCanvas = document.getElementById('sensorCanvas');
const ctx = sensorCanvas.getContext('2d');

// Grab the canvas element for mapping
const mapCanvas = document.getElementById('mapCanvas');
const mapCtx = mapCanvas.getContext('2d');

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
let flashingInterval; 
let lastPlotTime = 0;
let lastPosition = { x: 0, y: 0 };

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

  // Clear the IR canvas
  ctx.clearRect(0, 0, sensorCanvas.width, sensorCanvas.height);  // Clears the entire canvas

  statusText.innerText = "Disconnected";
  statusText.style.color = '#e61515';

  if (ros && ros.isConnected) {
    ros.close();
  }

  nameInput.value = '';
  robName = '';
  connBtn.innerText = "Connect";
}

// Function to update the arrow direction
function updateArrowDirection(angularZ) {
  const arrow = document.getElementById("directionArrow");
  if (angularZ > 0) {
      arrow.style.transform = "rotate(-90deg)"; // Left turn
  } else if (angularZ < 0) {
      arrow.style.transform = "rotate(90deg)"; // Right turn
  } else {
      arrow.style.transform = "rotate(0deg)"; // Forward
  }
}

//////// TIMER/RACING BUTTONS CODE ////////

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
  timerDisplay.innerText = 'Timer: 0.00s';
  timerMilliseconds = 0;
}

// Event listener for the "Race!" button
startButton.addEventListener('click', () => {
  startTimer(); 
  mode = 2; // Set mode to auto
  setLEDColor(mode); // Set LED color to red (flashing) 
});

// Event listener for the "Finish" button
stopButton.addEventListener('click', () => {
  stopTimer();
  mode = 1; // Set mode to manual
  setLEDColor(mode); // Set LED color to blue (static)
});

//////// CONNECT/DISCONNECT CODE ////////

// Connect/Disconnect button event listener
// Connect/Disconnect button event listener
connBtn.addEventListener('click', function() {
  const robName = nameInput.value;

  // Check if ros is connected
  if (ros && ros.isConnected) {
    console.log("Disconnecting from robot.");
    resetAll();  // Reset everything
  } else {
    console.log("Connecting to robot:", robName);

    // Create a new ROS connection
    ros = new ROSLIB.Ros({
      url: `ws://${hostip}:${port}`
    });

    ros.on('connection', function() {
      console.log('Connected to websocket server.');
      statusText.innerText = "Connected";
      statusText.style.color = '#03B5AA';
      connBtn.innerText = "Disconnect";  // Change button text to "Disconnect"

      // Setup cmdVel topic
      cmdVel = new ROSLIB.Topic({
        ros: ros,
        name: `/${robName}/cmd_vel`,
        messageType: 'geometry_msgs/Twist'
      });

      // Setup robPos topic
      robPos = new ROSLIB.Topic({
        ros: ros,
        name: `/${robName}/odom`,
        messageType: 'nav_msgs/Odometry'
      });

      // Setup LED topic
      ledTopic = new ROSLIB.Topic({
        ros: ros,
        name: `/${robName}/cmd_lightring`,
        messageType: 'irobot_create_msgs/LightringLeds'
      });

      // Subscribe to IR sensor data
      const irTopic = new ROSLIB.Topic({
        ros: ros,
        name: `/${robName}/ir_intensity`,
        messageType: 'irobot_create_msgs/IrIntensityVector'
      });

      irTopic.subscribe(function(message) {
        irData = message.readings.map(reading => reading.value);
        drawIRData(irData);
      });

      // Subscribe to the odometry data for the robot's position
      robPos.subscribe(function(message) {
        const x = message.pose.pose.position.x;
        const y = message.pose.pose.position.y;
        const theta = message.pose.pose.orientation.z;

        console.log(`Received position: x=${x}, y=${y}, theta=${theta}`);  // Log position for debugging

        resetOdometry();  // Reset odometry

        // Plot the robot position on the mapCanvas
        plotRobotPosition(x, y, theta);
      });

    // Disable safety features when connected
      disableSafetyFeatures(robName);
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


//////// IR READINGS CODE ////////

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

//////// DRIVING CODE ////////

// Forward movement
fwdBtn.addEventListener('mousedown', function() {
  forwardInterval = setInterval(function() {
    var twist = new ROSLIB.Message({
      linear: { x: 5, y: 0, z: 0 },
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
      angular: { x: 0, y: 0, z: 3 }
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
      angular: { x: 0, y: 0, z: -3 }
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

// Disble safety features to go full speed
const { exec } = require('child_process'); // Node.js module to run commands

// Function to disable safety features
function disableSafetyFeatures(robotName) {
  const cmd = `ros2 param set /motion_control safety_override full`;  // Command to disable safety features

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error(`Error disabling safety features: ${stderr}`);
      return;
    }
    console.log('Safety features disabled:', stdout);  // Log the success
  });
}


//////// LIGHT ON IROBOT CODE ////////

function setLEDColor(mode) {
  let color;

  // Log the mode being set
  console.log("Setting LED color, Mode:", mode);

  if (mode === 1) {
    // Set LED to blue (static) in manual mode
    color = {
      'leds': [
        { red: 0, green: 0, blue: 255 }, 
        { red: 0, green: 0, blue: 255 },
        { red: 0, green: 0, blue: 255 },
        { red: 0, green: 0, blue: 255 },
        { red: 0, green: 0, blue: 255 },
        { red: 0, green: 0, blue: 255 }
      ],
      'override_system': true
    };

    // Log the LED color being set
    console.log("Setting LED to blue:", color);

    if (flashingInterval) {
      clearInterval(flashingInterval);
      flashingInterval = null;
    }

    // Publish the blue color
    ledTopic.publish(new ROSLIB.Message(color));

  } else if (mode === 2) {
    // Flashing red LEDs in auto mode
    color = {
      'leds': [
        { red: 255, green: 0, blue: 0 }, 
        { red: 255, green: 0, blue: 0 },
        { red: 255, green: 0, blue: 0 },
        { red: 255, green: 0, blue: 0 },
        { red: 255, green: 0, blue: 0 },
        { red: 255, green: 0, blue: 0 }
      ],
      'override_system': true
    };

    // Log the LED color being set
    console.log("Setting LED to flashing red:", color);

    if (!flashingInterval) {
      flashingInterval = setInterval(() => {
        // Toggle the LEDs between off and red every 500ms
        if (color.leds[0].red === 255) {
          color.leds = [  // Turn LEDs off
            { red: 0, green: 0, blue: 0 },
            { red: 0, green: 0, blue: 0 },
            { red: 0, green: 0, blue: 0 },
            { red: 0, green: 0, blue: 0 },
            { red: 0, green: 0, blue: 0 },
            { red: 0, green: 0, blue: 0 }
          ];
        } else {
          color.leds = [  // Turn LEDs on (red)
            { red: 255, green: 0, blue: 0 },
            { red: 255, green: 0, blue: 0 },
            { red: 255, green: 0, blue: 0 },
            { red: 255, green: 0, blue: 0 },
            { red: 255, green: 0, blue: 0 },
            { red: 255, green: 0, blue: 0 }
          ];
        }

        console.log("Flashing LEDs:", color);  // Log every time the LEDs toggle
        ledTopic.publish(new ROSLIB.Message(color));
      }, 500); // Flashing interval of 500ms
    }
  }

  // Publish the LED color if no flashing is going on
  if (mode !== 2 && !flashingInterval) {
    console.log("Publishing LED color:", color);
    ledTopic.publish(new ROSLIB.Message(color));
  }
}

//////// MAP CANVAS CODE ////////

// Function to reset the odometry (robot's position)
function resetOdometry() {
  lastPosition = { x: 0, y: 0 };  // Reset position to (0, 0)
  lastPlotTime = 0;  // Reset last plot time to allow immediate plotting
  console.log("Odometry reset to (0, 0)");
}

// Function to plot robot's position with rate-limiting
function plotRobotPosition(x, y, theta) {
  const currentTime = Date.now();

  // Plot only if enough time has passed (for example, 100 ms)
  if (currentTime - lastPlotTime < 100) {
      return;  // Skip if it's too soon to plot
  }

  // Rate limit passed, so we can plot now
  lastPlotTime = currentTime;

  // Only plot if the robot has moved significantly (e.g., 0.1 meters)
  const distanceMoved = Math.sqrt(Math.pow(x - lastPosition.x, 2) + Math.pow(y - lastPosition.y, 2));
  if (distanceMoved < 0.1) {
      return;  // Skip if the robot hasn't moved enough
  }

  // Update last position
  lastPosition.x = x;
  lastPosition.y = y;

  // Now proceed with drawing the robot's position on the mapCanvas
  mapCtx.clearRect(0, 0, mapCanvas.width, mapCanvas.height);

  // Convert the robot's x, y coordinates to the canvas coordinates
  const canvasX = (x * 5) + (mapCanvas.width/2);  // Scale and center
  const canvasY = (y * 5) + (mapCanvas.height)/2;  // Scale and center

  // Draw the robot as a circle
  mapCtx.beginPath();
  mapCtx.arc(canvasX, canvasY, 10, 0, 2 * Math.PI);
  mapCtx.fillStyle = 'red';  // Set robot color
  mapCtx.fill();

  // Optionally, draw a small line showing the orientation (facing direction)
  const lineLength = 20;  // Length of the line showing the orientation
  const lineEndX = canvasX + Math.cos(theta) * lineLength;
  const lineEndY = canvasY + Math.sin(theta) * lineLength;

  mapCtx.beginPath();
  mapCtx.moveTo(canvasX, canvasY);
  mapCtx.lineTo(lineEndX, lineEndY);
  mapCtx.strokeStyle = 'green';  // Line color for orientation
  mapCtx.lineWidth = 2;
  mapCtx.stroke();
}


