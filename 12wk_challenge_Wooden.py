import time
import roslibpy
import threading
import math

# Connect to the ROS bridge
ros_node = roslibpy.Ros(host='192.168.8.104', port=9012)
ros_node.run()

robot_name = 'bravo'

# PD gains       
kp = 0.005
kd = 0.005
ki = 0.0 #add in later for PID control
kp_side = 0.001
kd_side = 0.001

previous_center = [100, 75, 50, 25, 0] #init with average of 50
previous_right = [100, 75, 50, 25, 0]
previous_left = [100, 75, 50, 25, 0]
error_sum = 0
left = 0
right = 0
front = 0

speed = 0.15 #m/s

# ROS publishers
drive_pub = roslibpy.Topic(ros_node, f'/{robot_name}/cmd_vel', 'geometry_msgs/Twist')
drive_pub.advertise()
ir_topic = roslibpy.Topic(ros_node, f'/{robot_name}/ir_intensity', 'irobot_create_msgs/IrIntensityVector')
    
def left_follow(left, previous_left, error_sum): #track the left wall
    print('Tracking left wall')
    del previous_left[0]
    previous_left.append(50-left)
    prev = sum(previous_left)/len(previous_left)
    
    error_sum += (50-left)
    theta = kp_side*(50 - left) + kd_side*((prev)/0.5) #+ ki*(error_sum*0.5)
    print(f'Theta: {theta}')

    drive_pub.publish(roslibpy.Message({"linear": {'x': speed, 'y': 0.0, 'z': 0.0}, 
                                        "angular": {'x': 0.0, 'y': 0.0, 'z': float(theta)}}))

def right_follow(right, previous_right, error_sum): # track the right wall
    print('Tracking right wall')
    del previous_right[0]
    previous_right.append(right-50)
    prev = sum(previous_right)/len(previous_right)
    
    error_sum += (right-50)
    theta = kp_side*(right - 50) + kd_side*((prev)/0.5) #+ ki*(error_sum*0.5)
    print(f'Theta: {theta}')

    drive_pub.publish(roslibpy.Message({"linear": {'x': speed, 'y': 0.0, 'z': 0.0}, 
                                        "angular": {'x': 0.0, 'y': 0.0, 'z': float(theta)}}))

def center_track(left, right, previous_center, error_sum): #track both walls
    del previous_center[0]
    previous_center.append(right-left)
    prev = sum(previous_center)/len(previous_center)
    
    error_sum += (right-left)
    theta = kp*(right - left) + kd*(prev/0.5) + ki*(error_sum*0.5)
    #print(f'Theta: {theta}')

    drive_pub.publish(roslibpy.Message({"linear": {'x': speed, 'y': 0.0, 'z': 0.0}, 
                                        "angular": {'x': 0.0, 'y': 0.0, 'z': float(theta)}}))

def callback_ir(message): #read IR data
    global left, right, front
    values = [reading['value'] for reading in message['readings']]
    left1 = values[0]
    left2 = values[1]
    left3 = values[2]
    front1 = values[3]
    right1 = values[6]
    right2 = values[5]
    right3 = values[4]

    left = (0.5*left1 + 1.5*left2)/2
    right = (0.5*right1 + 1.5*right2)/2
    front = (1.5*front1 + 0.75*left3 + 0.75*right3)/3

ir_topic.subscribe(callback_ir)

while True: #run wall follow algorithm
    #print(f'Left: {left}, Right: {right}, Front: {front}')
    if left > 50 and right > 50:
        center_track(left, right, previous_center, error_sum)
    elif left == 0 and right > 50:
        right_follow(right, previous_right, error_sum)
    elif right == 0 and left > 50:
        left_follow(left, previous_left, error_sum)
    else:
        center_track(left, right, previous_center, error_sum)

    time.sleep(0.1)
