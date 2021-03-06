/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * parameter validation functions
 */

var assert = require('assert-plus');
var constants = require('../util/constants');
var errors = require('./errors');
var restify = require('restify');
var util = require('util');
var util_common = require('./common');
var util_ip = require('./ip');
var util_mac = require('./mac');
var verror = require('verror');
var vasync = require('vasync');



// --- Globals



var INTERFACE_NAME_RE = /[a-zA-Z0-9_]{0,31}/;
var INTERFACE_NUM_RE = /[0-9]+$/;
var STR_RE = /\s/g;
var UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
var VALID_STATES = ['provisioning', 'stopped', 'running'];



// --- Internal helpers



/**
 * Calls callback with the appropriate error depending on the contents of errs
 */
function errResult(errs, validated, callback) {
    var invalid = false;
    if (errs.length !== 0) {
        var realErrs = [];
        var sortedErrs = errs.filter(function (e) {
            if (!e.hasOwnProperty('field')) {
                realErrs.push(e);
                return false;
            }
            if (!invalid && e.hasOwnProperty('code') &&
                e.code !== 'MissingParameter') {
                invalid = true;
            }

            return true;
        }).sort(function (a, b) { return (a.field > b.field) ? 1 : -1; });

        if (realErrs.length !== 0) {
            return callback(new restify.InternalError(
                realErrs.length === 1 ? realErrs[0] :
                    new verror.MultiError(realErrs),
                'Internal error'));
        }

        return callback(new errors.InvalidParamsError(
            invalid ? errors.msg.invalidParam : 'Missing parameters',
            sortedErrs));
    }

    return callback(null, validated);
}



// --- Exports



/**
 * Validates a boolean value
 */
function validateBoolean(name, val, callback) {
    if (typeof (val) === 'boolean') {
        return callback(null, val);
    }

    if (val === 'true' || val === 'false') {
        return callback(null, val === 'true');
    }

    return callback(new errors.invalidParam(name, 'must be a boolean value'));
}


/**
 * Validates that a name is a valid Illumos interface name
 */
function validateInterfaceName(name, val, callback) {
    validateNicTagName(name, val, function (err) {
        if (err) {
            return callback(err);
        }

        if (!INTERFACE_NUM_RE.test(val)) {
            return callback(errors.invalidParam(name, 'must end in a number'));
        }

        return callback(null, val);
    });
}


/**
 * Validates a valid nic tag name
 */
function validateNicTagName(name, val, callback) {
    validateString(name, val, function (err) {
        if (err) {
            return callback(err);
        }

        if (val.length > constants.MAX_INTERFACE_LEN) {
            return callback(errors.invalidParam(name,
                util.format('must not be longer than %d characters',
                    constants.MAX_INTERFACE_LEN)));
        }

        if (val && val.replace(INTERFACE_NAME_RE, '') !== '') {
            return callback(errors.invalidParam(name,
                'must only contain numbers, letters and underscores'));
        }

        return callback(null, val);
    });
}


/**
 * Validates an array of IP addresses
 */
function validateIParray(name, arr, callback) {
    var errs = [];
    var ips = [];

    // UFDS will return a scalar if there's only one IP. Also allow
    // comma-separated IPs from the commandline tools
    util_common.arrayify(arr).forEach(function (i) {
        var ip = i.replace(/\s+/, '');
        if (!ip) {
            return;
        }

        var ipNum = util_ip.addressToNumber(ip);
        if (!ipNum) {
            errs.push(ip);
        } else {
            ips.push(ipNum);
        }
    });

    if (errs.length !== 0) {
        var ipErr = errors.invalidParam(name,
            util.format('invalid IP%s', errs.length === 1 ? '' : 's'));
        ipErr.invalid = errs;
        return callback(ipErr);
    }

    return callback(null, ips);
}


/**
 * Validates an IP address
 */
function validateIP(name, addr, callback) {
    var ipNum = util_ip.addressToNumber(addr);

    if (!ipNum) {
        return callback(errors.invalidParam(name,
            constants.INVALID_IP_MSG));
    }

    return callback(null, ipNum);
}


/**
 * Validates a MAC address
 */
function validateMAC(name, addr, callback) {
    var macNum = util_mac.aton(addr);

    if (!macNum) {
        return callback(errors.invalidParam(name,
            'invalid MAC address'));
    }

    return callback(null, macNum);
}


/**
 * Validates an array of MAC addresses
 */
function validateMACarray(name, val, callback) {
    var arr = util_common.arrayify(val);
    var errs = [];
    var macs = [];

    for (var m in arr) {
        var macNum = util_mac.aton(arr[m]);
        if (macNum) {
            macs.push(macNum);
        } else {
            errs.push(arr[m]);
        }
    }

    if (errs.length !== 0) {
        var macErr = errors.invalidParam(name,
            util.format('invalid MAC address%s',
                errs.length === 1 ? '' : 'es'));
        macErr.invalid = errs;
        return callback(macErr);
    }

    return callback(null, macs);
}


/**
 * Validates a string: ensures it's not empty
 */
function validateString(name, str, callback) {
    if (typeof (str) !== 'string') {
        return callback(new errors.invalidParam(name, 'must be a string'));
    }

    if (str.replace(STR_RE, '') === '') {
        return callback(new errors.invalidParam(name, 'must not be empty'));
    }

    return callback(null, str);
}


/**
 * Validates a subnet
 */
function validateSubnet(name, subnetTxt, callback) {
    var params = {};
    var subnet = subnetTxt.split('/');
    var subnetErrs = [];

    if (subnet.length !== 2) {
        return callback(errors.invalidParam(name,
            'Subnet must be in CIDR form'));
    }

    params.subnet_start_ip = util_ip.addressToNumber(subnet[0]);
    params.subnet_bits = Number(subnet[1]);
    params[name] = subnetTxt;

    if (params.subnet_start_ip === null) {
        subnetErrs.push('IP');
    }

    if (isNaN(params.subnet_bits) ||
        (params.subnet_bits < constants.SUBNET_MIN) ||
        (params.subnet_bits > 32)) {
        subnetErrs.push('bits');
    }

    if (subnetErrs.length !== 0) {
        return callback(errors.invalidParam(name,
            util.format('Subnet %s invalid', subnetErrs.join(' and '))));
    }

    return callback(null, params);
}


/**
 * Validates a UUID
 */
function validateUUID(name, uuid, callback) {
    if (!UUID_RE.test(uuid)) {
        return callback(new errors.invalidParam(name, 'invalid UUID'));
    }

    return callback(null, uuid);
}


/**
 * Validates an array of UUIDs
 */
function validateUUIDarray(name, val, callback) {
    var arr = util_common.arrayify(val);

    // Dedup the list and find invalid UUIDs
    var invalid = {};
    var valid = {};
    arr.forEach(function (uuid) {
        if (UUID_RE.test(uuid)) {
            valid[uuid] = 1;
        } else {
            invalid[uuid] = 1;
        }
    });

    if (!util_common.hashEmpty(invalid)) {
        var err = new errors.invalidParam(name, 'invalid UUID');
        err.invalid = Object.keys(invalid).sort();
        return callback(err);
    }

    return callback(null, Object.keys(valid).sort());
}


/**
 * Validates a VLAN ID
 */
function validateVLAN(name, vlan_id, callback) {
    var id = Number(vlan_id);
    if (isNaN(id) || id < 0 ||
        id === 1 || id > 4094) {
        return callback(errors.invalidParam('vlan_id', constants.VLAN_MSG));
    }

    return callback(null, id);
}


/**
 * Validates the nic state is one of a limited set of strings.
 */
function validateNicState(name, state, callback) {
    if (typeof (state) !== 'string') {
        return callback(new errors.invalidParam(name, 'must be a string'));
    }

    if (VALID_STATES.indexOf(state) === -1) {
        return callback(new errors.invalidParam(name, 'must be a valid state'));
    }

    return callback(null, state);
}


/**
 * Validate parameters
 */
function validateParams(opts, callback) {
    var errs = [];
    var field;
    var validatedParams = {};

    assert.object(opts, 'opts');
    assert.object(opts.params, 'opts.params');
    assert.optionalObject(opts.params.required, 'opts.params.required');
    assert.optionalObject(opts.params.optional, 'opts.params.optional');
    assert.func(callback);

    var toValidate = [];

    for (field in opts.required) {
        assert.func(opts.required[field],
            util.format('opts.required[%s]', field));

        if (opts.params.hasOwnProperty(field)) {
            toValidate.push({
                field: field,
                fn: opts.required[field],
                val: opts.params[field]
            });
        } else {
            errs.push(errors.missingParam(field));
        }
    }

    for (field in opts.optional) {
        assert.func(opts.optional[field],
            util.format('opts.required[%s]', field));

        if (opts.params.hasOwnProperty(field)) {
            toValidate.push({
                field: field,
                fn: opts.optional[field],
                val: opts.params[field]
            });
        }
    }

    vasync.forEachParallel({
        inputs: toValidate,
        func: function _callValidateFn(val, cb) {
            // TODO: allow specifying an array of validation functions, and bail
            // after the first failure

            val.fn(val.field, val.val, function (e, validated) {
                if (e) {
                    errs.push(e);
                }

                if (typeof (validated) !== 'undefined') {
                    if (typeof (validated) === 'object' &&
                        !validated.hasOwnProperty('length')) {
                        for (var v in validated) {
                            validatedParams[v] = validated[v];
                        }
                    } else {
                        validatedParams[val.field] = validated;
                    }
                }

                return cb();
            });
        }
    }, function () {
        if (opts.hasOwnProperty('after')) {
            return opts.after(opts.params, validatedParams, function (err) {
                if (err) {
                    errs = errs.concat(
                        typeof (err) === 'object' ? err : [err]);
                }

                return errResult(errs, validatedParams, callback);
            });
        }

        return errResult(errs, validatedParams, callback);
    });
}

module.exports = {
    bool: validateBoolean,
    IP: validateIP,
    ipArray: validateIParray,
    interfaceName: validateInterfaceName,
    MAC: validateMAC,
    MACarray: validateMACarray,
    nicState: validateNicState,
    nicTagName: validateNicTagName,
    params: validateParams,
    string: validateString,
    subnet: validateSubnet,
    UUID: validateUUID,
    UUIDarray: validateUUIDarray,
    VLAN: validateVLAN
};
