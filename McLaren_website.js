console.clear();
console.log("Made it here");

const ip = "192.168.8.104";
const port = "9012";
let x = 0, y = 0;
let robName = "juliet";
let intervalId = null;
let left = 0, right = 0;  // Left and right IR sensor values
let previous_center = [100, 75, 50, 25, 0]; 
let previous_right = [100, 75, 50, 25, 0]; //init with average of 50
let previous_left = [100, 75, 50, 25, 0];
var speed = 0.3; // m/s
var kp = 0.005;
var kd = 0.005;
var kp_side = 0.002;
var kd_side = 0.002;

let connBtn = document.getElementById("connectButton");
let nameInput = document.getElementById("nameInput");
let fwdBtn = document.getElementById("UpButton");
let leftBtn = document.getElementById("LeftButton");
let rightBtn = document.getElementById("RightButton");
let stopBtn = document.getElementById("stopButtin");
let battVoltage = document.getElementById("batteryDisplay");
let centerFollowBtn = document.getElementById("startButton");

nameInput.addEventListener("input", function () {
    robName = nameInput.value.trim() || "juliet"; // Fallback to default
});

// // Initialize Chart.js for IR sensor graph
// const ctx = document.getElementById('irChart').getContext('2d');
// const irChart = new Chart(ctx, {
//     type: 'bar',
//     data: {
//         labels: ['IR1', 'IR2', 'IR3', 'IR4', 'IR5', 'IR6', 'IR7'],
//         datasets: [{
//             label: 'IR Sensor Values',
//             data: [0, 0, 0, 0, 0, 0, 0],
//             backgroundColor: 'rgba(54, 162, 235, 0.6)',
//             borderColor: 'rgba(54, 162, 235, 1)',
//             borderWidth: 1
//         }]
//     },
//     options: {
//         responsive: true,
//         plugins: {
//             legend: { position: 'top' },
//             tooltip: { enabled: true }
//         },
//         scales: {
//             x: { beginAtZero: true, max: 4500 },
//             y: { beginAtZero: true, max: 4500 }
//         }
//     }
// });

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

// Initialize Chart.js for position graph (X vs Y)
const posCtx = document.getElementById('positionChart').getContext('2d');
const positionChart = new Chart(posCtx, {
    type: 'scatter',
    data: {
        datasets: [{
            label: 'Robot Position (X, Y)',
            data: [],
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            pointRadius: 5,
            fill: false
        }]
    },
    options: {
        responsive: true,
        scales: { x: { title: { display: true, text: 'X Position (m)' } }, y: { title: { display: true, text: 'Y Position (m)' } } }
    }
});

// When the connect button is clicked
connBtn.addEventListener("click", function () {
    var ros = new ROSLIB.Ros({
        url: `ws://${ip}:${port}`
    });

    ros.on('connection', function () {
        console.log('Connected to websocket server.');
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').style.color = 'green';

        // Initialize drive_pub for publishing velocity commands
        let drive_pub = new ROSLIB.Topic({
            ros: ros,
            name: `/${robName}/cmd_vel`,
            messageType: 'geometry_msgs/Twist'
        });

        // Subscribe to battery state topic
        let battTopic = new ROSLIB.Topic({
            ros: ros,
            name: `/${robName}/battery_state`,
            messageType: 'sensor_msgs/BatteryState'
        });

        battTopic.subscribe(function (message) {
            let btP = message.percentage * 100;
            battVoltage.innerText = btP.toFixed(1);
        });

        // Subscribe to IR sensor data
        let irTopic = new ROSLIB.Topic({
            ros: ros,
            name: `/${robName}/ir_intensity`,
            messageType: 'irobot_create_msgs/IrIntensityVector'
        });

        irTopic.subscribe(function (message) {
            let values = message.readings.map(reading => reading.value);
            irChart.data.datasets[0].data = values; // Update IR chart data
            irChart.update(); // Refresh the chart

            let left1 = values[0], left2 = values[1], left3 = values[2];
            let right1 = values[6], right2 = values[5], right3 = values[4];
            left = (0.5*left1 + left2 + 1.5*left3) / 3;
            right = (0.5*right1 + right2 + 1.5*right3) / 3;
        });

        // Subscribe to odometry data
        let odomTopic = new ROSLIB.Topic({
            ros: ros,
            name: `/${robName}/odom`,
            messageType: 'nav_msgs/Odometry'
        });

        odomTopic.subscribe(function (message) {
            x = message.pose.pose.position.x;
            y = message.pose.pose.position.y;

            // Update position display
            document.getElementById('posX').textContent = `X: ${x.toFixed(2)}`;
            document.getElementById('posY').textContent = `Y: ${y.toFixed(2)}`;

            // Add new data point to position chart
            //positionChart.data.datasets[0].data.push({ x: x, y: y });
            //positionChart.update(); // Refresh the chart
        });

        let intervalId = null; // Shared intervalId to manage active commands
        let timerInterval = null; // Timer interval for the running timer
        let elapsedTime = 0; // Elapsed time in seconds

        // Function to clear the current interval and stop the robot
        function clearActiveCommand(drive_pub) {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;

                // Send a stop command
                let stopTwist = new ROSLIB.Message({
                    linear: { x: 0.0, y: 0.0, z: 0.0 },
                    angular: { x: 0.0, y: 0.0, z: 0.0 }
                });
                drive_pub.publish(stopTwist);
            }
        }

        // Function to start the timer
        function startTimer() {
            clearInterval(timerInterval); // Clear any existing timer
            elapsedTime = 0; // Reset elapsed time
            document.getElementById("timer").textContent = `Time: ${elapsedTime}s`;

            timerInterval = setInterval(function () {
                elapsedTime++;
                document.getElementById("timer").textContent = `Time: ${(elapsedTime*0.1).toFixed(1)}s`;
            }, 100); // Update every 0.1 seconds
        }

        // Function to stop the timer
        function stopTimer() {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        // Forward button logic
        fwdBtn.addEventListener("click", function () {
            console.log("Forward Button Pressed");
            clearActiveCommand(drive_pub);

            intervalId = setInterval(function () {
                let twist = new ROSLIB.Message({
                    linear: { x: 0.3, y: 0.0, z: 0.0 }, // Move forward
                    angular: { x: 0.0, y: 0.0, z: 0.0 }  // No rotation
                });
                drive_pub.publish(twist);
            }, 500);
        });

        // Left button logic
        leftBtn.addEventListener("click", function () {
            console.log("Left Button Pressed");
            clearActiveCommand(drive_pub);

            intervalId = setInterval(function () {
                let twist = new ROSLIB.Message({
                    linear: { x: 0.0, y: 0.0, z: 0.0 }, // No forward movement
                    angular: { x: 0.0, y: 0.0, z: 0.4 }  // Rotate left
                });
                drive_pub.publish(twist);
                updateArrowDirection(-1); // Update arrow to forward
            }, 500);
        });

        // Right button logic
        rightBtn.addEventListener("click", function () {
            console.log("Right Button Pressed");
            clearActiveCommand(drive_pub);

            intervalId = setInterval(function () {
                let twist = new ROSLIB.Message({
                    linear: { x: 0.0, y: 0.0, z: 0.0 }, // No forward movement
                    angular: { x: 0.0, y: 0.0, z: -0.4 }  // Rotate right
                });
                drive_pub.publish(twist);
                updateArrowDirection(1); // Update arrow to forward
            }, 500);
        });

        // Stop button logic
        stopBtn.addEventListener("click", function () {
            console.log("Stop Button Pressed");
            clearActiveCommand(drive_pub);
            stopTimer(); // Stop the timer
            updateArrowDirection(0); // Update arrow to forward
        });

        // Center Follow Function
        function center_track(left, right, previous_center) {
            previous_center.splice(0, 1); // remove first element (oldest value)
            previous_center.push(right-left); // add new value
            let sum = previous_center.reduce((a, b) => a+b, 0);
            let len = previous_center.length;
            let prev = sum/len;

            theta = kp*(right - left) + kd*(prev/0.5);

            let twist = new ROSLIB.Message({
                    linear: { x: speed, y: 0.0, z: 0.0 },
                    angular: { x: 0.0, y: 0.0, z: theta }
                });
            drive_pub.publish(twist);
            updateArrowDirection(theta); // Update arrow to forward
        }

        // Left Wall Follow Function
        function left_follow(left, previous_left) {
            previous_center.splice(0, 1); // remove first element (oldest value)
            previous_center.push(50-left); // add new value
            let sum = previous_left.reduce((a, b) => a+b, 0);
            let len = previous_left.length;
            let prev = sum/len;

            theta = kp_side*(50 - left) + kd_side*(prev/0.5);

            let twist = new ROSLIB.Message({
                    linear: { x: speed, y: 0.0, z: 0.0 },
                    angular: { x: 0.0, y: 0.0, z: theta }
                });
            drive_pub.publish(twist);
            updateArrowDirection(theta); // Update arrow to forward
        }
        
        // Right Wall Follow Function
        function right_follow(right, previous_right) {
            previous_center.splice(0, 1); // remove first element (oldest value)
            previous_center.push(right-50); // add new value
            let sum = previous_right.reduce((a, b) => a+b, 0);
            let len = previous_right.length;
            let prev = sum/len;

            theta = kp_side*(right - 50) + kd_side*(prev/0.5);

            let twist = new ROSLIB.Message({
                    linear: { x: speed, y: 0.0, z: 0.0 },
                    angular: { x: 0.0, y: 0.0, z: theta }
                });
            drive_pub.publish(twist);
            updateArrowDirection(theta); // Update arrow to forward
        }

        // Racetrack logic
        centerFollowBtn.addEventListener("click", function () {
            console.log("Race Button Pressed");
            clearActiveCommand(drive_pub);
            startTimer(); // Start the timer

            intervalId = setInterval(function () {
                if (left > 50 && right > 50) {
                    center_track(left, right, previous_center);
                } else if (right > 50) {
                    right_follow(right, previous_right);
                } else if (left > 50) {
                    left_follow(left, previous_left);
                } else {
                    center_track(left, right, previous_center);
                }
            }, 100); // run at 10Hz
        });

        // Disconnect button event
        disconnectBtn.addEventListener("click", function () {
            ros.close();
            document.getElementById('status').textContent = 'Disconnected';
            document.getElementById('status').style.color = 'red';
            connBtn.style.display = 'inline-block';
            disconnectBtn.style.display = 'none';
        });
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
    });
});
