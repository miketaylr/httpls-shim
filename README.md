# HTTP Live Streaming shim add-on

Totally not worth installing right now. The goal is to jam https://github.com/RReverser/mpegts into Firefox for Android and make it work.

### Building & Installation

`./build`

This should open an installation prompt in Firefox for Android on your device if it's connected. You can change targets in `config_build.sh`. After installation, the `xpi` is moved to the `bin/` directory.

### Testing

### TODO

- [ ] Get Shim working as addon
- [ ] Figure out why canvas in demo is so tiny
- [ ] Find more stable tests
- [ ] Make it fast


### License

This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at http://mozilla.org/MPL/2.0/.

Parts of this code licensed under the MIT License: https://github.com/RReverser/mpegts/blob/gh-pages/MIT-license.txt