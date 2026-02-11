/**
 * Browser translation of the original Google Apps Script.
 * GAS-only UI methods are intentionally omitted.
 */

function convert() {
  var directionEl = document.getElementById('direction');
  var inputEl = document.getElementById('input');
  var outputEl = document.getElementById('output');

  if (!inputEl || !outputEl) {
    return;
  }

  var direction = directionEl ? directionEl.value : 'cisco-to-aruba';
  var input = inputEl.value || '';
  var output = '';

  if (direction === 'cisco-to-aruba') {
    output = convertCiscoToAruba6100(input);
  } else if (direction === 'aruba-to-cisco') {
    output = 'Aruba to Cisco conversion is not implemented in this translated script.';
  } else {
    output = processForm({
      configType: 'convert6100',
      cisco6100Config: input
    });
  }

  outputEl.value = (output || '').trim();
}

function processForm(formObject) {
  var result = '';
  switch (formObject.configType) {
    case 'full':
      switch (formObject.switchType) {
        case '1':
          result = configHP2520(formObject);
          break;
        case '2':
          result = configHP2530(formObject);
          break;
        case '3':
          result = 'lol this is not done yet';
          break;
        default:
          result = 'Invalid switch type selection';
      }
      break;
    case 'aruba':
      result = configArubaInterfaceVlan(formObject);
      break;
    case 'cisco':
      result = configCiscoInterfaceVlan(formObject);
      break;
    case 'convert':
      result = convertCiscoToHP(formObject.ciscoConfig);
      break;
    case 'convert6100':
      result = convertCiscoToAruba6100(formObject.cisco6100Config);
      break;
    case 'convertHP2520ToAruba6100':
      result = convertHP2520ToAruba6100(formObject.hpConfig);
      break;
    default:
      result = 'Invalid configuration type selection';
  }
  return result;
}

function configArubaInterfaceVlan(formObject) {
  var config = [];

  var vlans = JSON.parse(formObject.vlans);
  for (var i = 0; i < vlans.length; i++) {
    config.push('vlan ' + vlans[i].number);
    config.push('   name ' + vlans[i].name);
    if (vlans[i].untagged) {
      config.push('   untagged ' + vlans[i].untagged);
    }
    if (vlans[i].tagged) {
      config.push('   tagged ' + vlans[i].tagged);
    }
    config.push('   exit');
  }

  var interfaces = JSON.parse(formObject.interfaces);
  for (var j = 0; j < interfaces.length; j++) {
    config.push('interface ' + interfaces[j].number);
    config.push('   name "' + interfaces[j].description + '"');
    config.push('   ' + (interfaces[j].poe === '1' ? 'power-over-ethernet' : 'no power-over-ethernet'));
    config.push('   exit');
  }

  return config.join('\n');
}

function configCiscoInterfaceVlan(formObject) {
  var config = [];

  var vlans = JSON.parse(formObject.vlans);
  var vlanMap = {};
  for (var i = 0; i < vlans.length; i++) {
    vlanMap[vlans[i].number] = vlans[i];
    config.push('vlan ' + vlans[i].number);
    config.push('   name ' + vlans[i].name);
    config.push('   exit');
  }

  var interfaces = JSON.parse(formObject.interfaces);
  for (var j = 0; j < interfaces.length; j++) {
    config.push('interface ' + interfaces[j].number);
    config.push('   description ' + interfaces[j].description);

    if (interfaces[j].poe === '1') {
      config.push('   power inline auto');
    } else {
      config.push('   power inline never');
    }

    var untaggedVlans = [];
    var taggedVlans = [];

    for (var vlanNumber in vlanMap) {
      if (!Object.prototype.hasOwnProperty.call(vlanMap, vlanNumber)) {
        continue;
      }
      if (vlanMap[vlanNumber].untagged && vlanMap[vlanNumber].untagged.includes(interfaces[j].number)) {
        untaggedVlans.push(vlanNumber);
      }
      if (vlanMap[vlanNumber].tagged && vlanMap[vlanNumber].tagged.includes(interfaces[j].number)) {
        taggedVlans.push(vlanNumber);
      }
    }

    if (untaggedVlans.length === 1 && taggedVlans.length === 0) {
      config.push('   switchport mode access');
      config.push('   switchport access vlan ' + untaggedVlans[0]);
    } else if (taggedVlans.length > 0 || untaggedVlans.length > 1) {
      config.push('   switchport mode trunk');
      if (untaggedVlans.length === 1) {
        config.push('   switchport trunk native vlan ' + untaggedVlans[0]);
      }
      var allowedVlans = taggedVlans.concat(untaggedVlans).sort(function (a, b) {
        return Number(a) - Number(b);
      }).join(',');
      config.push('   switchport trunk allowed vlan ' + allowedVlans);
    }

    config.push('   exit');
  }

  return config.join('\n');
}

function isValidVlan(vlanNum) {
  var nums = vlanNum.replace(/\s/g, '').split(',');
  for (var i = 0; i < nums.length; i++) {
    var num = nums[i];
    if (num.includes('-')) {
      var rangeNum = num.split('-');
      if (rangeNum.length !== 2 || isNaN(rangeNum[0]) || isNaN(rangeNum[1])) {
        return false;
      }
    } else if (isNaN(num)) {
      return false;
    }
  }
  return true;
}

function expandVlans(vlanStr) {
  var result = [];
  var parts = vlanStr.split(',');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].includes('-')) {
      var range = parts[i].split('-');
      var start = parseInt(range[0], 10);
      var end = parseInt(range[1], 10);
      for (var v = start; v <= end; v++) {
        result.push(v.toString());
      }
    } else {
      result.push(parts[i].trim());
    }
  }
  return result;
}

function configVlanAruba(config, vlanInputNum, vlanDesc, switchMgmtIp, vlanUntagNum, vlanTagNum) {
  config.push('vlan ' + vlanInputNum);
  config.push('name ' + vlanDesc);
  if (switchMgmtIp) {
    config.push('ip address ' + switchMgmtIp + '255.255.255.0');
  }
  if (isValidVlan(vlanUntagNum)) {
    config.push('untagged ' + vlanUntagNum);
  }
  if (isValidVlan(vlanTagNum)) {
    config.push('tagged ' + vlanTagNum);
  }
  config.push('   exit');
  return config;
}

function configIntAruba(config, intInputNum, intDesc, intPoe) {
  config.push('interface ' + intInputNum);
  config.push('name "' + intDesc + '"');
  config.push(intPoe === '1' ? 'power-over-ethernet' : 'no power-over-ethernet');
  config.push('   exit');
  return config;
}

function configHP2520(formObject) {
  var config = [];
  config.push('hostname "' + formObject.hostname + '"');
  config.push('time timezone -600');
  config.push('console inactivity-timer 5');
  config.push('no telnet-server');

  var interfaces = JSON.parse(formObject.interfaces);
  for (var i = 0; i < interfaces.length; i++) {
    configIntAruba(config, interfaces[i].number, interfaces[i].description, interfaces[i].poe);
  }

  config.push('ip default-gateway ' + formObject.defaultGateway);

  var vlans = JSON.parse(formObject.vlans);
  for (var j = 0; j < vlans.length; j++) {
    configVlanAruba(config, vlans[j].number, vlans[j].name, vlans[j].mgmtIp, vlans[j].untagged, vlans[j].tagged);
  }

  config.push('qos type-of-service diff-services\naaa authentication login privilege-mode\naaa authentication console login tacacs local\naaa authentication console enable tacacs local\naaa authentication ssh login tacacs local\naaa authentication ssh enable tacacs local\nlogging 172.18.6.59\nlogging facility local7\ninclude credentials\npassword operator sha1 "9c41b8a9c375d31b9162d4f0466f3eb87e9aa69d"\npassword manager sha1 "f4034e66a9f788e98bb9e349a0b9941516b1f128"\ntimesync sntp\nsntp unicast\nsntp server priority 1 172.18.0.153\ntacacs-server host 172.18.0.91\ntacacs-server key "afro60!dopey"\nno web-management\nip authorized-managers 172.18.0.0 255.255.0.0 access Manager\nsnmp-server community "f40zl9o2x" Unrestricted\nsnmp-server community "uhnet" Operator\nsnmp-server location "' + formObject.switchLoc + '"\nspanning-tree\nspanning-tree instance 1 vlan 1-4092');

  return config.join('\n');
}

function configHP2530(formObject) {
  var config = [];
  config.push('hostname "' + formObject.hostname + '"');

  var startConfig = 'logging 172.18.6.59\nlogging facility local7\ninclude-credentials\npassword operator user-name "operator" sha1 "9c41b8a9c375d31b9162d4f0466f3eb87e9aa69d"\npassword manager user-name "manager" sha1 "f4034e66a9f788e98bb9e349a0b9941516b1f128"\nqos type-of-service diff-services\ntimesync sntp\nsntp unicast\nsntp server priority 1 172.18.0.153\ntacacs-server host 172.18.0.91\ntacacs-server key "afro60!dopey"\nno telnet-server\ntime timezone -600\nno web-management\nip authorized-managers 172.18.0.0 255.255.0.0 access manager';

  config.push(startConfig);
  config.push('ip default-gateway ' + formObject.defaultGateway);

  var interfaces = JSON.parse(formObject.interfaces);
  for (var i = 0; i < interfaces.length; i++) {
    configIntAruba(config, interfaces[i].number, interfaces[i].description, interfaces[i].poe);
  }

  var tacacsInfo = 'snmp-server community "public" unrestricted\nsnmp-server community "f40zl9o2x" operator unrestricted\nsnmp-server community "uhnet" operator\nsnmp-server location "' + formObject.switchLoc + '"\naaa authentication login privilege-mode\naaa authentication console login tacacs\naaa authentication console enable tacacs\naaa authentication ssh login tacacs\naaa authentication ssh enable tacacs';

  config.push(tacacsInfo);

  var vlans = JSON.parse(formObject.vlans);
  for (var j = 0; j < vlans.length; j++) {
    configVlanAruba(config, vlans[j].number, vlans[j].name, vlans[j].mgmtIp, vlans[j].untagged, vlans[j].tagged);
  }

  var remainderConfig = 'spanning-tree\nspanning-tree instance 1 vlan 1-4092\nactivate provision disable\nactivate software-update disable\naruba-central disable\nallow-unsupported-transceiver\npassword manager user-name netops99 plaintext alauahio\nspanning-tree mode rapid-pvst';

  config.push(remainderConfig);

  return config.join('\n');
}

function convertCiscoToHP(ciscoConfig) {
  var hpConfig = [];
  var vlans = {};
  var interfaces = {};
  var currentVlan = null;

  var lines = ciscoConfig.split('\n');

  var insideSVI = null;
  hpConfig.push('; !!! WARNING !!!');
  hpConfig.push('; ---------------------------- ');
  hpConfig.push('; 2960 configs should not be converted to HP 2520/2530 due to supply concerns.');
  hpConfig.push('; It\'s getting harder and harder to recieve these - Brandon');
  hpConfig.push('; =========================== ');

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();

    if (line.startsWith('hostname')) {
      hpConfig.push(line);
    } else if (line.startsWith('vlan')) {
      var vlanId = line.split(' ')[1];
      vlans[vlanId] = { untagged: [], tagged: [] };
      currentVlan = vlanId;
    } else if (line.startsWith('name') && currentVlan) {
      var vlanName = line.substring(5).trim().replace(/"/g, '');
      vlans[currentVlan].name = vlanName;
    } else if (line.startsWith('interface')) {
      var intName = line.split(' ')[1];
      if (intName.startsWith('GigabitEthernet')) {
        var intNum = intName.split('/').pop();
        interfaces[intNum] = { config: [] };
        insideSVI = null;
      } else if (intName.startsWith('Vlan')) {
        insideSVI = intName.replace('Vlan', '');
        if (!vlans[insideSVI]) {
          vlans[insideSVI] = { untagged: [], tagged: [] };
        }
      }
    } else if (line.startsWith('ip address') && insideSVI) {
      var ip = line.split(' ').slice(2).join(' ');
      vlans[insideSVI].ip = ip;
    } else if (line === '!') {
      insideSVI = null;
    } else if (line.startsWith('switchport access vlan')) {
      var accessVlan = line.split(' ').pop();
      var accessInt = Object.keys(interfaces)[Object.keys(interfaces).length - 1];
      if (vlans[accessVlan]) {
        vlans[accessVlan].untagged.push(accessInt);
      }
    } else if (line.startsWith('switchport trunk allowed vlan')) {
      var vlanStr = line.split(' ').pop();
      var trunkVlans = expandVlans(vlanStr);
      var trunkInt = Object.keys(interfaces)[Object.keys(interfaces).length - 1];
      for (var j = 0; j < trunkVlans.length; j++) {
        var trunkVlan = trunkVlans[j];
        if (vlans[trunkVlan]) {
          vlans[trunkVlan].tagged.push(trunkInt);
        }
      }
    } else if (line.startsWith('switchport voice vlan')) {
      var voiceVlan = line.split(' ').pop();
      var voiceInt = Object.keys(interfaces)[Object.keys(interfaces).length - 1];
      if (vlans[voiceVlan]) {
        vlans[voiceVlan].tagged.push(voiceInt);
      }
    } else if (line.startsWith('description')) {
      var desc = line.split(' ').slice(1).join(' ').replace(/"/g, '');
      var descInt = Object.keys(interfaces)[Object.keys(interfaces).length - 1];
      interfaces[descInt].config.push('   name "' + desc + '"');
    } else if (line.startsWith('power inline')) {
      var poeInt = Object.keys(interfaces)[Object.keys(interfaces).length - 1];
      if (line.includes('never')) {
        interfaces[poeInt].config.push('   no power-over-ethernet');
      } else if (line.includes('auto')) {
        interfaces[poeInt].config.push('   power-over-ethernet');
      }
    } else if (line === 'shutdown' && insideSVI === null) {
      var keys = Object.keys(interfaces);
      if (keys.length > 0) {
        var shutInt = keys[keys.length - 1];
        interfaces[shutInt].config.push('   disable');
        interfaces[shutInt].config.push('   no power-over-ethernet');
      }
    } else if (line === 'spanning-tree mode rapid-pvst') {
      hpConfig.push('spanning-tree');
    } else if (line.startsWith('snmp-server community')) {
      var parts = line.split(' ');
      var community = parts[2].replace(/"/g, '');
      var access = parts.length > 3 ? (parts[3] === 'RO' ? 'Operator' : 'Manager') : 'Manager';
      hpConfig.push('snmp-server community "' + community + '" ' + access);
    } else if (line.startsWith('snmp-server location')) {
      hpConfig.push('snmp-server location "' + line.replace('snmp-server location', '').trim() + '"');
    }
  }

  Object.keys(vlans).forEach(function (vlanId) {
    var vlanInfo = vlans[vlanId];
    hpConfig.push('vlan ' + vlanId);

    if (vlanInfo.name) {
      hpConfig.push('   name "' + vlanInfo.name + '"');
    }

    if (vlanInfo.untagged.length > 0) {
      hpConfig.push('   untagged ' + vlanInfo.untagged.join(','));
    }

    if (vlanInfo.tagged.length > 0) {
      hpConfig.push('   tagged ' + vlanInfo.tagged.join(','));
    }

    if (String(vlanId) === '901') {
      hpConfig.push('   voice');
    }

    if (vlanInfo.ip) {
      hpConfig.push('   ip address ' + vlanInfo.ip);
    } else {
      hpConfig.push('   no ip address');
    }

    hpConfig.push('   exit');
  });

  Object.keys(interfaces).forEach(function (intNum) {
    var intInfo = interfaces[intNum];
    hpConfig.push('interface ' + intNum);
    hpConfig = hpConfig.concat(intInfo.config);
    hpConfig.push('   exit');
  });

  return hpConfig.join('\n');
}

function handleFormSubmit(formObject) {
  return processForm(formObject);
}

function convertCiscoToAruba6100(ciscoConfig) {
  var lines = ciscoConfig.split('\n');
  var vlans = {};
  var interfaces = {};
  var currentInterface = null;
  var currentVlan = null;
  var arubaConfig = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('snmp-server location')) {
      arubaConfig.push(line.replace('snmp-server location', 'snmp-server system-location'));
      continue;
    }

    if (line.startsWith('vlan ')) {
      var id = line.split(/\s+/)[1];
      vlans[id] = vlans[id] || { name: null, ip: null };
      currentVlan = id;
      continue;
    }

    if (currentVlan && (line.startsWith('name ') || line.startsWith('name\t'))) {
      vlans[currentVlan].name = line.replace(/^name\s+/, '').replace(/"/g, '');
      continue;
    }

    if (currentVlan && line.startsWith('interface ')) {
      currentVlan = null;
    }

    if (line.startsWith('interface ')) {
      var intName = line.split(/\s+/)[1];
      if (/^Vlan/i.test(intName)) {
        currentVlan = intName.replace(/^Vlan/i, '');
        currentInterface = null;
        continue;
      }

      var m = intName.match(/(\d+)$/);
      if (!m) {
        currentInterface = null;
        continue;
      }

      var portIdx = m[1];
      currentInterface = portIdx;
      interfaces[portIdx] = interfaces[portIdx] || {
        orig: intName,
        description: null,
        mode: null,
        accessVlan: null,
        voiceVlan: null,
        trunkVlans: [],
        nativeVlan: null,
        poe: null,
        qos: false,
        shutdown: false
      };
      continue;
    }

    if (line === '!' || line === 'end') {
      currentInterface = null;
      currentVlan = null;
      continue;
    }

    if (currentInterface) {
      var intf = interfaces[currentInterface];

      if (line.startsWith('description ')) {
        intf.description = line.replace(/^description\s+/, '');
        continue;
      }
      if (line.startsWith('switchport mode ')) {
        intf.mode = line.split(/\s+/).pop();
        continue;
      }
      if (line.startsWith('switchport access vlan ')) {
        intf.accessVlan = line.split(/\s+/).pop();
        continue;
      }
      if (line.startsWith('switchport voice vlan ')) {
        intf.voiceVlan = line.split(/\s+/).pop();
        continue;
      }
      if (line.startsWith('switchport trunk allowed vlan ')) {
        var vlanStr = line.replace(/^switchport trunk allowed vlan\s+/i, '').trim();
        var arr = typeof expandVlans === 'function' ? expandVlans(vlanStr) : vlanStr.split(',').map(function (s) {
          return s.trim();
        });
        intf.trunkVlans = intf.trunkVlans.concat(arr);
        continue;
      }
      if (line.startsWith('switchport trunk native vlan ')) {
        intf.nativeVlan = line.split(/\s+/).pop();
        continue;
      }
      if (line.startsWith('power inline ')) {
        intf.poe = !/never/i.test(line);
        continue;
      }
      if (line.toLowerCase().indexOf('trust cos') !== -1 || line.toLowerCase().indexOf('qos trust') !== -1 || line.toLowerCase().indexOf('mls qos') !== -1) {
        intf.qos = true;
        continue;
      }
      if (line === 'no shutdown') {
        intf.shutdown = false;
        continue;
      }
      if (line === 'shutdown') {
        intf.shutdown = true;
        continue;
      }
    }
  }

  Object.keys(interfaces).forEach(function (portIdx) {
    var intf = interfaces[portIdx];
    if (intf.voiceVlan === '901' && !intf.nativeVlan && intf.accessVlan) {
      intf.nativeVlan = intf.accessVlan;
    }
  });

  Object.keys(vlans).sort(function (a, b) {
    return Number(a) - Number(b);
  }).forEach(function (vlanId) {
    arubaConfig.push('vlan ' + vlanId);
    if (vlans[vlanId].name) {
      arubaConfig.push('name ' + vlans[vlanId].name);
    }
    if (vlanId === '901') {
      arubaConfig.push('voice');
    }
  });

  arubaConfig.push('spanning-tree mode rpvst');
  arubaConfig.push('spanning-tree');

  Object.keys(interfaces).map(Number).sort(function (a, b) {
    return a - b;
  }).forEach(function (portIdx) {
    var intf = interfaces[String(portIdx)];
    arubaConfig.push('interface 1/1/' + portIdx);

    if (intf.shutdown === false) {
      arubaConfig.push('    no shutdown');
    }
    if (intf.shutdown === true) {
      arubaConfig.push('    shutdown');
    }
    if (intf.qos) {
      arubaConfig.push('    qos trust cos');
    }
    if (intf.description) {
      arubaConfig.push('    description ' + intf.description);
    }
    if (intf.poe === false || intf.shutdown === true) {
      arubaConfig.push('    no power-over-ethernet');
    } else if (intf.poe === true) {
      arubaConfig.push('    power-over-ethernet');
    }

    var allowedSet = new Set();
    intf.trunkVlans.forEach(function (v) {
      if (v && v !== '') {
        allowedSet.add(String(v));
      }
    });
    if (intf.accessVlan) {
      allowedSet.add(String(intf.accessVlan));
    }
    if (intf.voiceVlan) {
      allowedSet.add(String(intf.voiceVlan));
    }

    if (intf.trunkVlans.length > 0 || (intf.mode === 'access' && intf.voiceVlan) || portIdx === 1) {
      var allowedArr = Array.from(allowedSet).map(Number).sort(function (a, b) {
        return a - b;
      }).map(String);
      if (allowedArr.length > 0) {
        var native = intf.nativeVlan ? intf.nativeVlan : '1';
        arubaConfig.push('    vlan trunk native ' + native);
        arubaConfig.push('    vlan trunk allowed ' + allowedArr.join(','));
      }
    } else if (intf.mode === 'access' && intf.accessVlan) {
      arubaConfig.push('    vlan access ' + intf.accessVlan);
    }
  });

  return arubaConfig.join('\n');
}

function convertHP2520ToAruba6100(hpConfig) {
  var lines = hpConfig.split('\n');
  var vlans = {};
  var interfaces = {};
  var hostname = null;

  function getOrCreateInterface(portIdx) {
    if (!interfaces[portIdx]) {
      interfaces[portIdx] = {
        orig: 'port ' + portIdx,
        description: null,
        mode: null,
        accessVlan: null,
        voiceVlan: null,
        trunkVlans: [],
        nativeVlan: null,
        poe: null,
        qos: false,
        shutdown: null,
        speedSetting: null
      };
    }
    return interfaces[portIdx];
  }

  function getOrCreateVlan(id) {
    if (!vlans[id]) {
      vlans[id] = {
        name: null,
        ip: null,
        voice: false
      };
    }
    return vlans[id];
  }

  function expandPortList(portStr) {
    var result = [];
    portStr.split(',').forEach(function (chunk) {
      chunk = chunk.trim();
      if (!chunk) {
        return;
      }
      if (chunk.indexOf('-') !== -1) {
        var parts = chunk.split('-');
        var start = parseInt(parts[0], 10);
        var end = parseInt(parts[1], 10);
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          for (var p = start; p <= end; p++) {
            result.push(String(p));
          }
        }
      } else {
        var pSingle = parseInt(chunk, 10);
        if (!isNaN(pSingle)) {
          result.push(String(pSingle));
        }
      }
    });
    return result;
  }

  var currentVlan = null;
  var currentInterface = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('snmp-server location')) {
      if (!interfaces._snmpLocation) {
        interfaces._snmpLocation = line.replace('snmp-server location', 'snmp-server system-location');
      }
      continue;
    }

    var vlanMatch = line.match(/^vlan\s+(\d+)/i);
    if (vlanMatch) {
      var vlanId = vlanMatch[1];
      currentVlan = vlanId;
      currentInterface = null;
      getOrCreateVlan(vlanId);
      continue;
    }

    if (currentVlan) {
      var v = getOrCreateVlan(currentVlan);

      if (/^name\s+/i.test(line)) {
        v.name = line.replace(/^name\s+/i, '').replace(/^"+|"+$/g, '');
        continue;
      }
      if (/^ip address\s+/i.test(line)) {
        v.ip = line.replace(/^ip address\s+/i, '').trim();
        continue;
      }
      if (/^voice\b/i.test(line)) {
        v.voice = true;
        continue;
      }
      if (/^tagged\s+/i.test(line)) {
        var taggedStr = line.replace(/^tagged\s+/i, '').trim();
        var taggedPorts = expandPortList(taggedStr);
        taggedPorts.forEach(function (p) {
          var intfTagged = getOrCreateInterface(p);
          if (intfTagged.trunkVlans.indexOf(String(currentVlan)) === -1) {
            intfTagged.trunkVlans.push(String(currentVlan));
          }
        });
        continue;
      }
      if (/^untagged\s+/i.test(line)) {
        var untaggedStr = line.replace(/^untagged\s+/i, '').trim();
        var untaggedPorts = expandPortList(untaggedStr);
        untaggedPorts.forEach(function (p) {
          var intfUntagged = getOrCreateInterface(p);
          intfUntagged.accessVlan = String(currentVlan);
          if (!intfUntagged.nativeVlan) {
            intfUntagged.nativeVlan = String(currentVlan);
          }
        });
        continue;
      }
      if (/^exit$/i.test(line)) {
        currentVlan = null;
        continue;
      }
      continue;
    }

    var intMatch = line.match(/^interface\s+(\d+)\b/i);
    if (intMatch) {
      var portIdx = intMatch[1];
      currentInterface = portIdx;
      currentVlan = null;
      getOrCreateInterface(portIdx);
      continue;
    }

    if (/^hostname\b/i.test(line)) {
      hostname = line.replace(/^hostname\s+/i, '').replace(/^"+|"+$/g, '');
      continue;
    }

    if (line === 'exit' || line === '!' || line === 'end') {
      currentInterface = null;
      currentVlan = null;
      continue;
    }

    if (currentInterface) {
      var intf = getOrCreateInterface(currentInterface);

      if (/^name\s+/i.test(line) || /^description\s+/i.test(line)) {
        intf.description = line.replace(/^(name|description)\s+/i, '').replace(/^"+|"+$/g, '');
        continue;
      }
      if (/^no power-over-ethernet\b/i.test(line)) {
        intf.poe = false;
        continue;
      }
      if (/^power-over-ethernet\b/i.test(line)) {
        intf.poe = true;
        continue;
      }
      if (/^disable$/i.test(line)) {
        intf.shutdown = true;
        continue;
      }
      if (/^enable$/i.test(line)) {
        intf.shutdown = false;
        continue;
      }
      if (line.toLowerCase().indexOf('qos trust cos') !== -1 || line.toLowerCase().indexOf('trust cos') !== -1) {
        intf.qos = true;
        continue;
      }

      var sdMatch = line.match(/^speed-duplex\s+(\S+)/i);
      if (sdMatch) {
        intf.speedSetting = sdMatch[1];
        continue;
      }

      var voiceMatch = line.match(/^voice vlan\s+(\d+)/i);
      if (voiceMatch) {
        intf.voiceVlan = voiceMatch[1];
        continue;
      }
    }
  }

  Object.keys(interfaces).forEach(function (portIdx) {
    if (portIdx === '_snmpLocation') {
      return;
    }
    var intf = interfaces[portIdx];
    if (intf.voiceVlan === '901' && !intf.nativeVlan && intf.accessVlan) {
      intf.nativeVlan = intf.accessVlan;
    }
  });

  var arubaConfig = [];
  if (hostname) {
    arubaConfig.push('hostname ' + hostname);
  }
  if (interfaces._snmpLocation) {
    arubaConfig.push(interfaces._snmpLocation);
  }

  Object.keys(vlans).map(Number).sort(function (a, b) {
    return a - b;
  }).forEach(function (vlanIdNum) {
    var vlanId = String(vlanIdNum);
    var v = vlans[vlanId];
    arubaConfig.push('vlan ' + vlanId);
    if (v.name) {
      arubaConfig.push('    name ' + v.name);
    }
    if (v.voice || vlanId === '901') {
      arubaConfig.push('    voice');
    }
  });

  arubaConfig.push('spanning-tree mode rpvst');
  arubaConfig.push('spanning-tree');

  Object.keys(interfaces).filter(function (k) {
    return k !== '_snmpLocation';
  }).map(Number).sort(function (a, b) {
    return a - b;
  }).forEach(function (portIdxNum) {
    var portIdx = String(portIdxNum);
    var intf = interfaces[portIdx];

    arubaConfig.push('interface 1/1/' + portIdx);

    if (intf.shutdown === false) {
      arubaConfig.push('    no shutdown');
    } else if (intf.shutdown === true) {
      arubaConfig.push('    shutdown');
    }

    if (intf.qos) {
      arubaConfig.push('    qos trust cos');
    }

    if (intf.description) {
      arubaConfig.push('    description ' + intf.description);
    }

    if (intf.poe === false || intf.shutdown === true) {
      arubaConfig.push('    no power-over-ethernet');
    } else if (intf.poe === true) {
      arubaConfig.push('    power-over-ethernet');
    }

    if (intf.speedSetting) {
      var val = intf.speedSetting.toLowerCase();

      if (val.startsWith('auto')) {
        var speeds = [];
        if (val !== 'auto') {
          if (val.indexOf('10') !== -1) {
            speeds.push('10m');
          }
          if (val.indexOf('100') !== -1) {
            speeds.push('100m');
          }
          if (val.indexOf('1000') !== -1) {
            speeds.push('1g');
          }
        }

        if (speeds.length > 0) {
          arubaConfig.push('    speed auto ' + speeds.join(' '));
        } else {
          arubaConfig.push('    speed auto');
        }
      } else {
        arubaConfig.push('    speed ' + val);
      }
    }

    var allowedSet = new Set();
    (intf.trunkVlans || []).forEach(function (vlan) {
      if (vlan && vlan !== '') {
        allowedSet.add(String(vlan));
      }
    });

    if (intf.accessVlan) {
      allowedSet.add(String(intf.accessVlan));
    }
    if (intf.voiceVlan) {
      allowedSet.add(String(intf.voiceVlan));
    }

    var hasTrunk = intf.trunkVlans && intf.trunkVlans.length > 0;

    if (hasTrunk || portIdxNum === 1) {
      var allowedArr = Array.from(allowedSet).map(Number).sort(function (a, b) {
        return a - b;
      }).map(String);

      if (allowedArr.length > 0) {
        var native = intf.nativeVlan ? String(intf.nativeVlan) : (intf.accessVlan ? String(intf.accessVlan) : '1');
        arubaConfig.push('    vlan trunk native ' + native);
        arubaConfig.push('    vlan trunk allowed ' + allowedArr.join(','));
      }
    } else if (intf.accessVlan) {
      arubaConfig.push('    vlan access ' + intf.accessVlan);
    }
  });

  return arubaConfig.join('\n');
}

function updateModeFields() {
  var modeEl = document.getElementById('mode');
  var fullFields = document.getElementById('fullFields');
  var jsonFields = document.getElementById('jsonFields');

  if (!modeEl || !fullFields || !jsonFields) {
    return;
  }

  var mode = modeEl.value;
  fullFields.style.display = mode === 'full' ? 'block' : 'none';
  jsonFields.style.display = (mode === 'full' || mode === 'aruba' || mode === 'cisco') ? 'block' : 'none';
}

function safeJsonArray(input) {
  var trimmed = (input || '').trim();
  if (!trimmed) {
    return '[]';
  }

  try {
    var parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed);
  } catch (err) {
    throw new Error('Invalid JSON input.');
  }
}

function convert() {
  var modeEl = document.getElementById('mode');
  var inputEl = document.getElementById('input');
  var outputEl = document.getElementById('output');

  if (!modeEl || !inputEl || !outputEl) {
    return;
  }

  var mode = modeEl.value;
  var input = inputEl.value || '';

  var formObject = {
    configType: mode
  };

  try {
    if (mode === 'convert6100') {
      formObject.cisco6100Config = input;
    } else if (mode === 'convert') {
      formObject.ciscoConfig = input;
    } else if (mode === 'convertHP2520ToAruba6100') {
      formObject.hpConfig = input;
    } else if (mode === 'full') {
      formObject.switchType = (document.getElementById('switchType') || {}).value || '1';
      formObject.hostname = (document.getElementById('hostname') || {}).value || '';
      formObject.defaultGateway = (document.getElementById('defaultGateway') || {}).value || '';
      formObject.switchLoc = (document.getElementById('switchLoc') || {}).value || '';
      formObject.vlans = safeJsonArray((document.getElementById('vlansJson') || {}).value || '');
      formObject.interfaces = safeJsonArray((document.getElementById('interfacesJson') || {}).value || '');
    } else if (mode === 'aruba' || mode === 'cisco') {
      formObject.vlans = safeJsonArray((document.getElementById('vlansJson') || {}).value || '');
      formObject.interfaces = safeJsonArray((document.getElementById('interfacesJson') || {}).value || '');
    }

    outputEl.value = (processForm(formObject) || '').trim();
  } catch (err) {
    outputEl.value = 'Error: ' + err.message;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', function () {
    updateModeFields();
  });
}
