---
title: "NESZero: NES Controller + Raspberry Pi Zero"
date: 2022-08-10T10:19:40+01:00
draft: false
math: true
imgs: 
    - full_wiring_carpet.JPG
---
<p align="center">
    <img src="case_closed_connected_front.JPG" width="400px"/>
    <img src="case_closed_connected_back.JPG" width="400px"/>
</p>

This project began more or less because I wanted to play EarthBound on a CRT TV. The TV itself only supports one connection type, a single scart port on the back of the unit. It became clear rather quickly that this kind of connectivity is a big limiting factor when it comes to approaching a problem like this.
I had a few options that I soon exhausted:

- ~~Playstation 2's Homebrew Scene~~ - Despite there being a few SNES emulators available, the performance was abysmal
- ~~HDMI to Composite adapter~~ - Only supports a subset of the PAL standards, displays incorrectly (in black and white) on my CRT TV.

So lets build something new.

# Build Requirements

- Full speed SNES games
- CRT TV Friendly

Settled on using a Raspberry Pi since they have RetroPie nicely packaged up, flocked to thingiverse for insperation and stumbled upon a NES controller project.
This seemed liked perfect fodder to fuel this project, and a few more requirements were drawn out of this decision:

- NES controller can be used as a functional controller
- Toggle the power on the console with a combination of NES Controller buttons
- Cram an RCA composite connection into the small form factor
- Add an Indicator LED


# Wiretapping the NES controller

We want to be able to use the controller functionally but also read a button combination from it to toggle the Rapsberry Pi Zero's power state.

To understand if this is even possible we first need to understand two things a little better:

- Raspberry Pi Zero power options
- NES Controller functionality

## Raspberry Pi Zero Power Options

Raspberry Pi makes use of a feature called device tree overlays. Among other things it allows for kernel modules to be enabled / disabled at boot time. Raspberry Pi devices come by default with a plethora of built in dtoverlays that can be used to modify behaviour at boot. 

The documentation for the overlays can be found on your Raspberry Pi device under /boot/overlay/README, or over on the [Raspberrypi firmware github page](https://raw.githubusercontent.com/raspberrypi/firmware/master/boot/overlays/README). One such overlay stands out as a very good candidate for achieving the power control we want:

<details>
  <summary>README</summary>
  
```
Name:   gpio-shutdown
Info:   Initiates a shutdown when GPIO pin changes. The given GPIO pin
        is configured as an input key that generates KEY_POWER events.
...
        This overlay only handles shutdown. After shutdown, the system
        can be powered up again by driving GPIO3 low. The default
        configuration uses GPIO3 with a pullup, so if you connect a
        button between GPIO3 and GND (pin 5 and 6 on the 40-pin header),
        you get a shutdown and power-up button. Please note that
        Raspberry Pi 1 Model B rev 1 uses GPIO1 instead of GPIO3.
Load:   dtoverlay=gpio-shutdown,<param>=<val>
Params: gpio_pin                GPIO pin to trigger on (default 3)
                                For Raspberry Pi 1 Model B rev 1 set this
                                explicitly to value 1, e.g.:

                                    dtoverlay=gpio-shutdown,gpio_pin=1

        active_low              When this is 1 (active low), a falling
                                edge generates a key down event and a
                                rising edge generates a key up event.
                                When this is 0 (active high), this is
                                reversed. The default is 1 (active low).

        gpio_pull               Desired pull-up/down state (off, down, up)
                                Default is "up".

                                Note that the default pin (GPIO3) has an
                                external pullup. Same applies for GPIO1
                                on Raspberry Pi 1 Model B rev 1.

        debounce                Specify the debounce interval in milliseconds
                                (default 100)
```
</details>

> `The default configuration uses GPIO3 with a pullup, so if you connect a button between GPIO3 and GND, you get a shutdown and power-up button`

This sounds like the exact behaviour we are looking for. Pull `GPIO3` low and we get a power toggle pin. 

We will enable this dtoverlay later on in the software section. Since we now know the Pi is willing to play ball lets take a deeper dive in to how the NES controller works.
## How NES Controllers Work

NES Controller's are surprisingly simple. They consist of a single 4021 8-bit shift register. This little IC reads 8 separate inputs and can output them serially over a single pin. You can see from this diagram that each parallel input pin (`P1-8`) is wired to a button on the controller:

<a name="nes004-diagram"></a>
<p align="center">
    <img src="nes004-diagram.png" width="800px"/>
</p>

The other pins of note here are `CK` `P/S`, `DS` and `O8`.

|Name |Description|
|-----|-----------|
|`CK` |Clock pin  |
|`P/S`| Parallel or Serial select pin|
|`O8` | Serial Output|
|`DS` | Serial input, tied LOW|


When the Console want's to know which buttons are are being pressed, it will do the following:

 - Set `P/S` LOW, we are now in Parallel in, serial out mode. On each clock pulse, the 4021 will capture the state of the 8 connected buttons in parallel
 - Send 1 clock pulse on the `CK` pin. 
 - Set `P/S` HIGH, we are now in serial in, parallel out mode. On each clock pulse, the 4021 will read a new value in from `DS` and shift all registers to the right 
 - Loop 8 times:
    - Read the value of `O8`
    - Send 1 clock pulse on the `CK` pin. The next value becomes available on `O8` 

By stepping through this process, the Console can extract each button's state from the NES controller using only 3 wires.

RetroPie actually had a driver that does this for us so we can wire the NES controller directly on to our GPIO to get full controller support.

Theory over, lets build something.
## Using An ATtiny To Bridge The Gap

<img align="right" style="margin: 0 0 0 5px;" src="attiny45.png" width=60px/>

We need a man in the middle to be able to drive GPIO 3 LOW when certain buttons are pressed on the NES Controller. This is because the Pi cannot do the work for us when it is powered off. For this project I decided to use an AATiny45 microcontroller for the job since I had a few lying around.

One problem we need to address is that two devices cannot interface with the 8 bit shift register of the NES controller at the same time without interfering with each other, Both `CK` and `P/S` need a single controller to be deterministic. However, each of the 8 NES buttons has its own dedicated connection pin on `P1-8`. So all we need to do is decide on a combination now and 'wiretap' connections from those pins to our ATtiny as inputs. 

We can prove this works by providing power to the 8-bit shift register and checking for a voltage shift on one of the 8 'Parallel In' pins, lets use `P8`. `P8`'s voltage level shifts when we press the `A` button:

<p align="center">
    <img src="nes004-oscilloscope-hook.JPG" width=300px/><img src="4021_button_test.gif" width=800px/>
</p>

> Pressing the `A` button pulls the voltage LOW, returning to HIGH when released

Looking good. I opted to use buttons `start` + `select` as my combination. 

Let's get a breadboard set up and start trying to implement this. My NES controller has a CD4021BC IC, below is the pinout for this IC and the ATtiny45:
<table style="width: 100%;">
<tr><td style="width:50%;">

```goat
            .-+   +-. 
 Par In P8 -+  '-'  +- 3v3
Buf Out O6 -+       +- P7 Par In
Buf Out O8 -+       +- P6 Par In
 Par In P4 -+       +- P5 Par In
 Par In P3 -+       +- O7 Buf Out
 Par In P2 -+       +- DS Ser In
 Par In P1 -+       +- CK Clock
       GND -+       +- P/S Par/Ser
            '-------'
              4021
```
</td>
<td style="width:50%;">

```goat
     .-+   +-. 
RST -+  '-'  +- 3v3
PB3 -+       +- PB2
PB4 -+       +- PB1
GND -+       +- PB0
     '-------'
      ATtiny45

```
</td><tr>
</table>


Comparing the `Parallel In` pins with the [nes004 diagram](#nes004-diagram), we have enough information to wire this up now:

<table style="width: 100%;">
    <tr>
        <td colspan="2">
            <img src="shift_register_connections.JPG" width=400px/>
        </td>
        <td>
            <img src="attiny_breadboard.JPG" width=400px/>
        </td>
    </tr>
    <tr>
        <th>4021</td>
        <th>Attiny45</td>
        <td rowspan="5" style="width:50%;"> 

```goat
     4021
   .-+   +-. 3v3 .---------------.
  -+  '-'  +-----'  ATtiny45     |    LED
  -+       +-     .---------.    |    .-.
  -+    P6 +---. -+ PB0 GND +--. | .-+ 𝚡 |
  -+    P5 +--.'--+ PB1 PB4 +- | | |  '+'
  -+       +- '---+ PB2 PB3 +--)-)-'   |
  -+       +-   .-+ 3v3 RST +- | |    .-.
  -+       +-   | |   .-.   |  | |220Ω| |
 .-+ GND   +-   | '--+   +--'  | |    '-'
 | '-------'    '--------------)-'     |
 +-----------------------------'-------'
```
   </td>
    </tr>
    <tr>
        <td>P6 (select)</td>
        <td>PB1</td>
    </tr>
    <tr>
        <td>P5 (start)</td>
        <td>PB2</td>
    </tr>
    <tr>
        <td>3v3</td>
        <td>3v3</td>
    </tr>
    <tr>
        <td>GND</td>
        <td>GND</td>
    </tr>
</table>


Now that we have our hardware setup we need to start writing some software. All Raspberry Pi's come with on-board SPI and we can leverage this to write directly to our ATTIny45 using AVRDude.

### AVRDude Setup

To make this a little easier you can build up a very simple breadboard circuit for seating your ATtiny when you want to flash to it. 

> Resistors aren't required if you are using the 3v3 pin to power the ATtiny


<table style="width:100%;">
<tr><td style="width:50%;">

<p align="center">
    <img src="attiny_flash_beside_pi.JPG" width=400px/>
</p>
</td>
<td style="width:50%;">

```goat
                 ATtiny45   
---------.      .---------.
 GPIO 10 +------+ PB0 GND +--.
 GPIO 9  +------+ PB1 PB4 +- |
 GPIO 11 +------+ PB2 PB3 +- |
 3v3     +------+ 3v3 RST +--+
 GND     +---.  |   .-.   |  |
---------'   |  '--+   +--'  |
 Rasp Pi     '---------------'
```
</td><tr>
</table>
As seen in the picture, you can optionally connect `RST` (reset pin) to an additional GPIO on the Raspberry Pi, Pulling `RST` LOW puts the ATtiny into flash mode so realistically you can just tie this to `GND`.


Login to your Raspberry Pi of choice and do the following steps.

Install dependencies:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install bison automake autoconf flex gcc-avr binutils-avr avr-libc -y
```

Clone a copy of AVRDude from github:
```bash
git clone https://github.com/kcuzner/avrdude
```

cd to the directory and compile AVRDude, go get a coffee because this step will take a while:
```bash
cd avrdude/avrdude
./bootstrap
./configure
sudo make install
```

Now lets test the connection, connect your ATtiny up to the SPI pins on your Raspberry Pi and run the following:

```bash
sudo avrdude -p t45 -c linuxspi -P /dev/spidev0.0 -b 10000
```

<details>
  <summary>Output</summary>

```bash
pi@raspberrypi:~ $ sudo avrdude -p t45 -c linuxspi -P /dev/spidev0.0 -b 10000

avrdude: AVR device initialized and ready to accept instructions

Reading | ################################################## | 100% 0.01s

avrdude: Device signature = 0x1e9206

avrdude: safemode: Fuses OK (E:FF, H:DF, L:62)

avrdude done.  Thank you.
pi@raspberrypi:~ $ 
```
</details>

If you get a similar output then your Pi can now communicate with the ATtiny! 

You can see the fuse settings listed in the output. The ATtiny45 usually comes with these values as defaults and looking specifically at the LOW fuse setting, `0x62` means `Use the internal 8Mhz RC clock source and divide by 8`.
 
So out of the box the ATtiny is only clocked at 1Mhz. We can change this to use the 16Mhz PLL clock by modifying the LOW fuse to a value of `0xF1`. There is a [great online calculator](https://www.engbedded.com/fusecalc/) that is useful for understanding the fuses in more detail.

> Please note that modifying fuse values is a potentially dangerous activity, please make sure you understand the fuse values you are modifying before running the command

Let's change the LOW fuse to use a 16MHz clock, our code will be designed with the 16Mhz clock speed in mind:

```bash
sudo avrdude -p t45 -c linuxspi -P /dev/spidev0.0 -b 10000 -U lfuse:w:0xf1:m
```

<details>
  <summary>Output</summary>

```bash
pi@raspberrypi:~ $ sudo avrdude -p t45 -c linuxspi -P /dev/spidev0.0 -b 10000 -U lfuse:w:0xf1:m

avrdude: AVR device initialized and ready to accept instructions

Reading | ################################################## | 100% 0.01s

avrdude: Device signature = 0x1e9206
avrdude: reading input file "0xf1"
avrdude: writing lfuse (1 bytes):

Writing | ################################################## | 100% 0.02s

avrdude: 1 bytes of lfuse written
avrdude: verifying lfuse memory against 0xf1:
avrdude: load data lfuse data from input file 0xf1:
avrdude: input file 0xf1 contains 1 bytes
avrdude: reading on-chip lfuse data:

Reading | ################################################## | 100% 0.00s

avrdude: verifying ...
avrdude: 1 bytes of lfuse verified

avrdude: safemode: Fuses OK (E:FF, H:DF, L:F1)

avrdude done.  Thank you.

pi@raspberrypi:~ $
```
</details>

Great, you can see the fuse value has now changed. We should be running at 16Mhz now when it comes to runtime. 

The code that I eventually used in this project is available [here](https://github.com/kennedn/nes-zero/blob/main/code/attiny/main.c). 

It uses the Interrupt and Timer features of the ATtiny45 to essentially say:

```python
while True:
    if IN_PIN_1 == 0 and IN_PIN_2 == 0:
        sleep(1.2)
        if IN_PIN_1 == 0 and IN_PIN_2 == 0:
            OUT_PIN = 0
        else:
            OUT_PIN = 1
    else: 
        OUT_PIN = 1
```

You can compile this code and push it to your ATtiny by running the following commands:

```bash
avr-gcc main.c -mmcu=attiny45 -Os -o main.bin
avr-objcopy -O ihex main.bin main.hex
sudo avrdude -p t45 -c linuxspi -P /dev/spidev0.0 -b 10000 -U flash:w:main.hex
```
<details>
  <summary>Output</summary>
  
```bash
pi@raspberrypi:~/attiny$ avr-gcc main.c -mmcu=attiny45 -Os -S -o main.S
pi@raspberrypi:~/attiny$ avr-objcopy -O ihex main.bin main.hex
pi@raspberrypi:~/attiny$ sudo avrdude -p t45 -c linuxspi -P /dev/spidev0.0 -b 1
0000 -U flash:w:main.hex

avrdude: AVR device initialized and ready to accept instructions

Reading | ################################################## | 100% 0.01s

avrdude: Device signature = 0x1e9206
avrdude: NOTE: "flash" memory has been specified, an erase cycle will be performed
         To disable this feature, specify the -D option.
avrdude: erasing chip
avrdude: reading input file "main.hex"
avrdude: input file main.hex auto detected as Intel Hex
avrdude: writing flash (230 bytes):

Writing | ################################################## | 100% 0.98s

avrdude: 230 bytes of flash written
avrdude: verifying flash memory against main.hex:
avrdude: load data flash data from input file main.hex:
avrdude: input file main.hex auto detected as Intel Hex
avrdude: input file main.hex contains 230 bytes
avrdude: reading on-chip flash data:

Reading | ################################################## | 100% 1.79s

avrdude: verifying ...
avrdude: 230 bytes of flash verified

avrdude: safemode: Fuses OK (E:FF, H:DF, L:F1)

avrdude done.  Thank you.

pi@raspberrypi:~/attiny$
```
</details>

We can now test the chip in on our breadboard:

<p align="center">
    <img src="attiny_button_test.gif" width="500px"/>
</p>

And finally solder the ATtiny onto some strip board, the module itself will be seated between two pillars in the case bottom:

<p align="center">
    <img src="full_wiring_attiny_highlight.JPG" width="500px"/>
</p>

This equated to a stripboard piece with 11 x 6 holes for me. You can sand down the edges to fine tune the size so it fits in the cavity. The design for the board is very simple you just need to isolate the adjacent pins from each other by placing some holes in the center:

<p align="center">
    <img src="attiny_stripboard.png" width="240px"/>
    <img src="attiny_stripboard_empty.png" width="240px"/>
</p>

Onto the next circuit.

# Hack The Jack Back

Most full sized Raspberry Pi models have an on-board 4 pole TRRS jack that consists of 2 audio channels and a composite video channel. However to conserve space on the Zero, most I/O ports have either been minimized or removed completely:

<p align="center">
    <img src="raspberry_pi_zero_board.svg" width="400px"/>
</p>

Not all hope is lost however. The composite pin is still exposed as the `TV` header on the board:

<p align="center">
    <img src="raspberry_pi_zero_board.svg#svgView(viewBox(185, 30, 12, 15))" width=200; />
</p>

And as it turns out we can actually just re-purpose two PWM pins from the main 40 pin GPIO block. As of Raspbian Buster (10), the standard way of doing this is by using a dtoverlay called audremap. This overlay allows you to choose a pin set to remap and will make an audio device available at runtime using these pins.

<details>
<summary>README</summary>

```
Name:   audremap
Info:   Switches PWM sound output to GPIOs on the 40-pin header
Load:   dtoverlay=audremap,<param>=<val>
Params: swap_lr                 Reverse the channel allocation, which will also
                                swap the audio jack outputs (default off)
        enable_jack             Don't switch off the audio jack output
                                (default off)
        pins_12_13              Select GPIOs 12 & 13 (default)
        pins_18_19              Select GPIOs 18 & 19
```
</details>

There is a catch however. The TRRS jack of a fully fledged Raspberry Pi has a low pass filter circuit that reduces noise on each audio channel. This is something that is missing on the raw PWM pins and we are going to have to add it back to get the crisp audio we are seeking.

## What is a low pass filter?

A low pass filter is a circuit that essentially places an upper bound on the output frequency of a signal. In respect to our audio channels, this means we can eliminate high frequency noise that might interfere with our signal. We know that the 'good' part of the signal is going to be within the human hearing range (20hz - 20,000hz), so we can design a circuit with a cut off frequency close to 20,000hz. 

To understand how this kind of circuit works it can be useful to see it in action. Let's look at a simple low-pass filter circuit, and see what happens to the output signal (<b><mark style="background-color: #fff; color: green">green</mark></b>) when we increase the frequency of the input signal (<b><mark style="background-color: #fff; color: red">red</mark></b>). 

<p align="center">
    <img src="10hz_lowpass.gif" width="50%"/>
</p>

The cut-off frequency for this circuit is 26.79Hz. This can be calculated with the following formula:
$$f = {1 / 2\Pi rc}$$

Substituting our values:
<br>
$${ r} = 270Ω$$
<br>
$${ c} = 22\mathrm{e}{-6}F$$
<br>
$${1 / 2 * \Pi * 270 * 22\mathrm{e}{-6}} = 26.793761463282046$$

You can see in the above GIF that there is a `phase` difference between the output and the input, the output voltage takes some time before it reflects the input voltage. This is caused by the capacitor charging and discharging at a specific rate. At 10Hz we are below the cut off frequency and the output is able to reflect the input voltage in time before the next signal edge. However what happens when we approach the cut-off frequency (26Hz) and then move beyond to 100Hz:

<table style="width:100%;">
<tr><td style="width:50%; padding: 1px;">

<p align="center">
    <img src="26hz_lowpass.gif" width="100%"/>
</p>
</td>
<td style="width:50%; padding: 1px;">
<p align="center">
    <img src="100hz_lowpass.gif" width="100%"/>
</p>
</td><tr>
</table>

The signal starts to `attenuate` (weaken) as we move beyond the cut-off frequency and that is the trick to the low-pass filter. If the frequency of the input signal at a given point in time is too fast for the capacitor to keep up, that part of the signal is essentially eliminated.

There are a few additional complications that we must solve for in our circuit. The output voltage of our PWM pins is `3.3v`. The standard audio line-level in consumer products has a peak voltage of around `1.5v` so we need to reduce our PWM signal down to this level to be within spec. We can create a voltage divider to achieve this and it only requires one additional resistor per channel.

We should also place a DC filter capacitor just before our output, this only permits AC and stops DC voltage from making its way to our speakers.

This is our final circuit:

<table style="width:100%;">
<tr><td style="width:50%; padding: 1px;">

```goat
 PWM in ___             audio out
>------|___|--+---+--||---------->
   270Ω       |   |    10uF
             _+_ .-. 
             --- | |150Ω
         22nF |  '-'
              |   | 
              '-+-'
           GND _|_
```
</td>
<td style="width:50%; padding: 1px;">
</td>
</tr>
</table>

The 270Ω resistor is 're-used' in our circuit as one half of the voltage divider. The second 150Ω resistor makes up the second part and together they reduce the voltage to approx `1.18v`. This can be calculated using the voltage divider formula:

$$V_{out} = \frac{R_b}{R_a+R_b} \times V_{in}$$

Substituting our values:
<br>
$${R_a} = 270Ω$$
<br>
$${R_b} = 150Ω$$
<br>
$$V_{in} = 3.3V$$
<br>
$$\frac{150}{270+150} \times 3.3 = 1.1785714285714286V$$

<p align="center">
    <img src="low_pass_filter_v1_bb.png" width="80%"/>
</p>
