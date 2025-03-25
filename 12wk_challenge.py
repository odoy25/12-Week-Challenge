import time
import roslibpy
import threading
import math

# Connect to the ROS bridge
ros_node = roslibpy.Ros(host='192.168.8.104', port=9012)
ros_node.run()

robot_name = 'echo'

# PID gains       
kp = 0.005
kd = 0.004
ki = 0.0015

previous = [0, 25, 50, 75, 100] #init with average of 50
error_sum = 0
left = 0
right = 0    

# ROS publishers
drive_pub = roslibpy.Topic(ros_node, f'/{robot_name}/cmd_vel', 'geometry_msgs/Twist')
drive_pub.advertise()
ir_topic = roslibpy.Topic(ros_node, f'/{robot_name}/ir_intensity', 'irobot_create_msgs/IrIntensityVector')
    
def left_follow(left, previous, error_sum): #track the left wall
    print('Tracking left wall')
    prev = sum(previous)/len(previous)
    error_sum += (50-left)
    theta = kp*(50 - left) + kd*(((50-left) - prev)/0.5) + ki*(error_sum*0.5)
    print(f'Theta: {theta}')

    drive_pub.publish(roslibpy.Message({"linear": {'x': 0.25, 'y': 0.0, 'z': 0.0}, 
                                        "angular": {'x': 0.0, 'y': 0.0, 'z': float(theta)}}))
    del previous[0]
    previous.append(50-left)

def right_follow(right, previous, error_sum): # track the right wall
    print('Tracking right wall')
    prev = sum(previous)/len(previous)
    error_sum += (right-50)
    theta = kp*(right - 50) + kd*((prev - (right-50))/0.5) + ki*(error_sum*0.5)
    print(f'Theta: {theta}')

    drive_pub.publish(roslibpy.Message({"linear": {'x': 0.25, 'y': 0.0, 'z': 0.0}, 
                                        "angular": {'x': 0.0, 'y': 0.0, 'z': float(theta)}}))
    del previous[0]
    previous.append(right-50)

def center_track(left, right, previous, error_sum): #track both walls
    prev = sum(previous)/len(previous)
    error_sum += (right-left)
    theta = kp*(right - left) + kd*((prev - (right-left))/0.5) + ki*(error_sum*0.5)
    print(f'Theta: {theta}')

    drive_pub.publish(roslibpy.Message({"linear": {'x': 0.25, 'y': 0.0, 'z': 0.0}, 
                                        "angular": {'x': 0.0, 'y': 0.0, 'z': float(theta)}}))
    del previous[0]
    previous.append(right-left)
    print(previous)

def callback_ir(message): #read IR data
    global left, right, front
    values = [reading['value'] for reading in message['readings']]
    left1 = values[0]
    left2 = values[1]
    left3 = values[2]
    right1 = values[6]
    right2 = values[5]
    right3 = values[4]

    left = (0.25*left1 + 0.5*left2 + left3) / 1.75
    right = (0.25*right1 + 0.5*right2 + right3) / 1.75

ir_topic.subscribe(callback_ir)

while True: #run wall follow algorithm
    print(f'Left: {left}, Right: {right}')
    if left > 50 and right > 50:
        center_track(left, right, previous, error_sum)
    elif left == 0 and right > 50:
        right_follow(right, previous, error_sum)
    elif right == 0 and left > 50:
        left_follow(left, previous, error_sum)
    else:
        center_track(left, right, previous, error_sum)

    time.sleep(0.1)
