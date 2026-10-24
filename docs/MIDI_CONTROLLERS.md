# MIDI controllers

Use **MIDI** in the header or Performance toolbar. Parameter Motion controls also
include **Configure MIDI**. Start MIDI explicitly and grant browser permission.
Chrome and Edge support Web MIDI; USB/Bluetooth availability depends on the
browser, operating system and controller. Choose an input when several devices
share CC numbers. Map preserves its existing CC-number assignments across channels.

In a visual/effect parameter's Motion controls, choose **MIDI fader**, click
**MIDI Learn** and move the desired knob or fader. Set Minimum/Maximum and Flip
as needed. The assignment is saved with the show. MIDI input changes the evaluated
parameter; it does not write keyframes or save the live device value as a default.
A controller that has not sent a value reads zero.

## Launch Control XL MK1/MK2 lights

1. Connect the controller and start MIDI.
2. In MIDI setup, choose its normal **Launch Control XL** output, not HUI/DAW.
3. Select the LED channel used by the current controller template. **Use last
   input channel** copies the channel of the last received CC; custom templates
   may use a separate LED channel, so check their configuration if needed.
4. Click **Enable controller lights**. No device is written before this action.

Green marks controls assigned anywhere in the open show. Amber marks controls
assigned to the selected visual. Brightness increases with the normalized input
value in three steps. It represents the incoming control level, before a
parameter's range, inversion or clipping. Knobs/buttons with a matching note/CC
and channel receive the light; the hardware faders have no LEDs.

The driver uses the original MK1/MK2 current-template LED protocol. It does not
rewrite templates, reset the controller, enable flashing or request SysEx access.
Launch Control XL3 has a different output protocol and is not supported by this
LED driver; its ordinary absolute CC input can still be mapped with Learn.
Changing a template on the controller changes which LEDs match the configured
CC/channel. Keep the appropriate template selected or adjust the LED channel.

**Stop controller lights** clears only controls written by this window and keeps
MIDI input running. **Stop MIDI** also releases input listeners and clears live
levels. Routing changes and output disconnection require enabling lights again.
Cleanup is best effort if the USB connection has already disappeared. Closing
the editor releases its connections. Device selections are session-local and do
not change the saved show; opening a show never starts MIDI automatically.

Clean local output windows receive the editor's levels and never open a second
MIDI connection or send controller lights. Editor disconnect clears their inputs.
Agents use the same saved assignments as the UI; agent edits update the lights
only when the operator already enabled feedback in the editor. Saved CLI/MCP
verification remains deterministic with MIDI input at zero.

## Qualification

The source implementation has simulated-port and actual mounted-App tests for
message bytes, routing, Learn, assignment changes, live Performance values,
Undo, permission races, disconnection and cleanup. Real controller LEDs, browser
permission dialogs, USB/Bluetooth transport and sustained device performance
still need physical/browser acceptance. See the current verification packet.

Protocol reference: [Novation Launch Control XL programmer's guide](https://fael-downloads-prod.focusrite.com/customer/prod/s3fs-public/downloads/launch-control-xl-programmers-reference-guide.pdf).
