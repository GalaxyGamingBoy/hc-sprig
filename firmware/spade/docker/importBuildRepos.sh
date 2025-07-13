mkdir ~/jerryscript_build
cd ~/jerryscript_build
git clone https://github.com/hackclub/jerryscript-pico.git jerryscript
cd jerryscript

mkdir ~/raspberrypi
cd ~/raspberrypi
git clone https://github.com/GalaxyGamingBoy/rpi-pico-sdk.git pico-sdk
git clone https://github.com/raspberrypi/pico-extras.git
cd pico-sdk
#git checkout 7070d230c0cdf1add83fa86b6832b47b2da47788
git submodule update --init
cd ../pico-extras
#git checkout 09c64d509f1d7a49ceabde699ed6c74c77e195a1
git submodule update --init
