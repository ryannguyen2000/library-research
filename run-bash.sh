
# run docker

# Add to crontab:
# @reboot path-to-dir/run-bash.sh on Hosh
echo ""
echo ""
echo "
   _____ ____ ___________  _    _ __  __ 
  / ____/ __ \___  /  __ \| |  | |  \/  |
 | |   | |  | |/ / |  _  /| |  | | |\/| |
 | |___| |__| / /__| | \ \| |__| | |  | |
  \_____\____/_____|_|  \_\\____/|_|  |_|
                                                                                                                                         
"
echo ""
echo "Resource Path: " $COZRUM_ZALO_RESOURCES
echo "User Data Path: " $COZRUM_ZALO_USER_DATA

echo ""
echo "STOP DOCKER CONTAINER: cozrum-api"
sudo docker stop cozrum-api
echo ""

echo ""
echo "RUN DOCKER CONTAINER: cozrum-api"
echo ""

sudo docker run \
    -i \
    -d \
    --init \
    -e TZ=Asia/Ho_Chi_Minh \
    --rm \
    --cap-add=SYS_ADMIN \
    --log-driver local \
    --log-opt max-size=100m \
    --log-opt max-file=100 \
    -v ./publish:/home/node/api-cozrum/publish \
    -v ./lib:/home/node/api-cozrum/lib \
    -v ./logs:/home/node/api-cozrum/logs \
    -v ./puppeteer:/home/node/api-cozrum/puppeteer \
    -v ./record:/home/node/api-cozrum/record \
    --name=cozrum-api \
    --net=host \
    cozrum-api

echo ""
echo "CONTAINER LOG: cozrum-api"
echo ""
docker logs -f cozrum-api
