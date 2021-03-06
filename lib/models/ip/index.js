/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * IP model
 */

var assert = require('assert-plus');
var common = require('./common');
var constants = require('../../util/constants');
var errors = require('../../util/errors');
var IP = common.IP;
var mod_moray = require('../../apis/moray');
var restify = require('restify');
var util = require('util');
var util_common = require('../../util/common');
var util_ip = require('../../util/ip');
var util_mac = require('../../util/mac');
var validate = require('../../util/validate');



// --- Globals



// Parameters used for creating a new nic object. Some are optional.
var CREATE_PARAMS = [
    'belongs_to_type',
    'belongs_to_uuid',
    'check_owner',
    'ip',
    'network',
    'network_uuid',
    'owner_uuid',
    'reserved'
];
// Parameters that are shared with nics
var NIC_SHARED_PARAMS = [
    'belongs_to_type',
    'belongs_to_uuid',
    'check_owner',
    'owner_uuid',
    'reserved'
];



// --- Internal helpers



/**
 * Validates an IP argument: can be either a number or an address
 */
function validateIP(name, ip, callback) {
    if (isNaN(ip)) {
        return validate.IP(name, ip, callback);
    }

    var addr = util_ip.ntoa(ip);
    if (!addr) {
        return callback(errors.invalidParam(name,
            constants.INVALID_IP_MSG));
    }

    return callback(null, ip);
}


/**
 * Validates that a network object is present
 */
function validateNetworkObj(name, net, callback) {
    if (!net || typeof (net) !== 'object') {
        return callback(errors.invalidParam(name,
            'could not find network'));
    }

    // Return a single-item object here: if we just return net,
    // validate.params() thinks it should add all properties of net to its
    // results
    return callback(null, { network: net });
}


/**
 * If we are attempting to add or update owner_uuid, ensure that it
 * matches the network
 */
function validateNetworkOwner(params, validated, callback) {
    if (!validated.network) {
        // We've already failed to validate the network - just return
        return callback();
    }

    if (validated.owner_uuid &&
        (!validated.hasOwnProperty('check_owner') ||
        validated.check_owner) &&
        !validated.network.isOwner(validated.owner_uuid)) {
        return callback(errors.invalidParam('owner_uuid',
            constants.OWNER_MATCH_MSG));
    }

    return callback();
}



// --- Exports



/*
 * List IPs in a network
 *
 * @param app {App}
 * @param log {Log}
 * @param params {Object}:
 * - `network_uuid`: Network UUID (required)
 * @param callback {Function} `function (err, ips)`
 */
function listNetworkIPs(app, log, params, callback) {
    log.debug(params, 'listNetworkIPs: entry');
    var bucket = common.getBucketObj(params.network_uuid);
    var ips = [];

    var listOpts = {
        sort: {
            attribute: 'ip',
            order: 'ASC'
        }
    };

    var req = app.moray.findObjects(bucket.name,
        mod_moray.filter(params, bucket) || '(ip=*)', listOpts);

    req.on('error', function _onNetListErr(err) {
        return callback(err);
    });

    req.on('record', function _onNetListRec(rec) {
        // If a record is not reserved, do not display it (the 2 keys in value
        // in this case are 'reserved' and 'ip')
        if (rec.value.reserved === 'true' || rec.value.reserved === true ||
            Object.keys(rec.value).length > 2) {
            var ip = new IP(rec.value);
            ip.params.network_uuid = params.network_uuid;
            ips.push(ip);
        }
    });

    req.on('end', function _endNetList() {
        return callback(null, ips);
    });
}


/*
 * Get an IP
 *
 * @param app {App}
 * @param log {Log}
 * @param params {Object}:
 * - `ip`: IP number (required)
 * - `network_uuid`: Network UUID (required)
 * - `returnObject` {Boolean}: Return an IP object even if the record
 *   does not exist in moray (optional)
 * @param callback {Function} `function (err, ipObj)`
 */
function getIP(opts, callback) {
    var app = opts.app;
    var log = opts.log;
    var params = opts.params;

    log.debug(params, 'getIP: entry');
    var ipNum = common.ipToNumber(params.ip);
    if (!ipNum) {
        return callback(new restify.InvalidArgumentError('invalid IP'));
    }

    var ipBucket = common.getBucketObj(params.network_uuid);
    mod_moray.getObj(app.moray, ipBucket, ipNum.toString(),
        function (err, rec) {
        if (err) {
            if (err.statusCode === 404) {
                if (opts.returnObject) {
                    return callback(null, new IP({
                        etag: null,
                        free: true,
                        ip: ipNum,
                        network_uuid: params.network_uuid,
                        reserved: false
                    }));
                }

                return callback(
                    new restify.ResourceNotFoundError('IP not found'));
            }

            return callback(err);
        }

        rec.value.network_uuid = params.network_uuid;
        rec.value.etag = rec._etag;
        return callback(null, new IP(rec.value));
    });
}


/**
 * Updates an IP
 *
 * @param app {App}
 * @param log {Log}
 * @param params {Object}:
 * - `belongs_to_type`: Belongs to type (optional)
 * - `belongs_to_uuid`: Belongs to UUID (optional)
 * - `ip`: IP address or number (required)
 * - `network_uuid`: Network UUID (required)
 * - `owner_uuid`: Owner UUID (optional)
 * - `reserved`: Reserved (optional)
 * @param callback {Function} `function (err, ipObj)`
 */
function updateIP(app, log, params, callback) {
    log.debug(params, 'updateIP: entry');
    var ip = common.ipToNumber(params.ip);

    if (!ip) {
        return callback(new restify.InvalidArgumentError(
            'Invalid IP "%s"', params.ip));
    }

    var validateParams = {
        params: params,

        optional: {
            belongs_to_type: validate.string,
            belongs_to_uuid: validate.UUID,
            check_owner: validate.bool,
            owner_uuid: validate.UUID,
            reserved: validate.bool
        },

        required: {
            network: validateNetworkObj
        },

        after: validateNetworkOwner
    };

    // both belongs_to_type and belongs_to_uuid must be set in UFDS at the
    // same time.  If they are set, owner_uuid must be as well.
    if (params.hasOwnProperty('oldIP')) {
        if (params.belongs_to_uuid && !params.oldIP.belongs_to_type) {
            validateParams.required.belongs_to_type =
                validateParams.optional.belongs_to_type;
            delete validateParams.optional.belongs_to_type;
        }

        if (params.belongs_to_type && !params.oldIP.belongs_to_uuid) {
            validateParams.required.belongs_to_uuid =
                validateParams.optional.belongs_to_uuid;
            delete validateParams.optional.belongs_to_uuid;
        }

        if (!params.oldIP.owner_uuid && (params.belongs_to_type ||
            params.belongs_to_uuid)) {
            validateParams.required.owner_uuid =
                validateParams.optional.owner_uuid;
            delete validateParams.optional.owner_uuid;
        }
    }

    validate.params(validateParams, function (validationErr, validatedParams) {
        if (validationErr) {
            return callback(validationErr);
        }

        var updateOpts = {
            bucket: common.getBucketObj(params.network_uuid),
            key: ip.toString(),
            moray: app.moray,
            val: validatedParams
        };

        // If unassigning, remove the 'belongs_to' information, but keep
        // owner and reserved
        if (params.unassign) {
            updateOpts.val = {
                belongs_to_type: true,
                belongs_to_uuid: true
            };
            updateOpts.remove = true;
        }

        // Don't add the entire network object to the moray record
        delete updateOpts.val.network;

        mod_moray.updateObj(updateOpts, function (err, rec) {
            if (err) {
                log.error({
                    err: err,
                    ip: params.ip,
                    ipNum: ip,
                    opts: { val: updateOpts.val, remove: updateOpts.remove }
                }, 'Error updating IP');

                return callback(err);
            }

            rec.value.network_uuid = params.network_uuid;
            rec.value.etag = rec._etag;
            var newIP = new IP(rec.value);

            log.info({
                ip: params.ip,
                ipNum: ip,
                obj: newIP.serialize(),
                opts: { val: updateOpts.val, remove: updateOpts.remove }
            }, 'Updated IP');

            return callback(null, newIP);
        });
    });
}


/**
 * Creates an IP
 *
 * @param app {App}
 * @param log {Log}
 * @param params {Object}:
 * - `ip`: IP address or number (required)
 * - `network_uuid`: Network UUID (required)
 * - `network`: Network object (required)
 * @param callback {Function} `function (err, ipObj)`
 */
function createIP(app, log, params, callback) {
    log.debug(params, 'createIP: entry');

    var validateParams = {
        params: params,

        required: {
            ip: validateIP,
            network: validateNetworkObj,
            // We've already validated this courtesy of whoever called us
            // (they would have used network_uuid to validate the network
            // object above), but we want it in the validated params to
            // put in the IP object:
            network_uuid: validate.UUID
        },

        optional: {
            check_owner: validate.bool,
            reserved: validate.bool
        },

        after: validateNetworkOwner
    };

    if (params.hasOwnProperty('belongs_to_uuid') ||
        params.hasOwnProperty('belongs_to_type')) {
        validateParams.required.belongs_to_uuid = validate.UUID;
        validateParams.required.belongs_to_type = validate.string;
        validateParams.required.owner_uuid = validate.UUID;
    }

    if (!validateParams.required.hasOwnProperty('owner_uuid')) {
        validateParams.optional.owner_uuid = validate.UUID;
    }

    validate.params(validateParams, function (validationErr, validated) {
        if (validationErr) {
            return callback(validationErr);
        }

        try {
            var ip = new IP(validated);
        } catch (err) {
            log.error(err, 'addIP: error creating IP');
            return callback(err);
        }

        var ipBucket = common.getBucketObj(validated.network.uuid);
        log.debug({ params: params, bucket: ipBucket }, 'addIP: creating IP');

        app.moray.putObject(ipBucket.name, ip.number.toString(), ip.raw(),
            { etag: null }, function (err) {
            if (err) {
                log.error({
                    err: err,
                    ip: ip.address,
                    ipNum: ip.number,
                    obj: ip.serialize()
                }, 'Error creating IP');

                return callback(err);
            }

            log.info({
                ip: ip.address,
                ipNum: ip.number,
                obj: ip.serialize()
            }, 'Created IP');

            return callback(null, ip);
        });
    });
}


/**
 * Create a new IP object using the parameters from the old object, plus
 * any updated parameters
 */
function createUpdatedObject(oldIP, params) {
    var updatedIpParams = oldIP.serialize();
    NIC_SHARED_PARAMS.forEach(function (p) {
        if (params.hasOwnProperty(p)) {
            updatedIpParams[p] = params[p];
        }
    });
    updatedIpParams.etag = oldIP.etag;

    return new IP(updatedIpParams);
}


/**
 * Creates an IP
 *
 * @param app {App}
 * @param log {Log}
 * @param params {Object}:
 * - `batch` {Array of Objects}
 * - `ip`: IP address or number (required)
 * - `network_uuid`: Network UUID (required)
 * @param callback {Function} `function (err, ipObj)`
 */
function batchCreateIPs(app, log, params, callback) {
    log.debug(params, 'batchCreateIPs: entry');
    var bucket = common.getBucketObj(params.network_uuid);
    var ips = [];

    var batchData = params.batch.map(function (ipParams) {
        var ip = new IP(ipParams);
        ips.push(ip);
        return {
            bucket : bucket.name,
            key: ip.number.toString(),
            operation: 'put',
            value: ip.raw()
        };
    });

    log.info(batchData, 'batchCreateIPs: creating IPs');
    app.moray.batch(batchData, function (err) {
        if (err) {
            return callback(err);
        }

        return callback(null, ips);
    });
}


/*
 * Deletes an IP
 *
 * @param app {App}
 * @param log {Log}
 * @param params {Object}:
 * - `ip`: IP number or address (required)
 * - `network_uuid`: Network UUID (required)
 * @param callback {Function} `function (err, ipObj)`
 */
function deleteIP(app, log, params, callback) {
    log.debug(params, 'deleteIP: entry');
    var ip = common.ipToNumber(params.ip);
    if (!ip) {
        return callback(new restify.InvalidArgumentError(
            'Invalid IP "%s"', params.ip));
    }

    log.info(params, 'deleteIP: deleting IP %s', util_ip.ntoa(ip));
    mod_moray.updateObj({
        bucket: common.getBucketObj(params.network_uuid),
        key: ip.toString(),
        moray: app.moray,
        replace: true,
        val: { ip: ip.toString(), reserved: false }
    }, function (err, res) {
        if (err) {
            log.error({
                err: err,
                ip: params.ip,
                ipNum: ip
            }, 'Error deleting IP');

        } else {
            log.info({
                ip: params.ip,
                ipNum: ip,
                raw: res.value
            }, 'Deleted IP');
        }

        return callback(err, res);
    });
}


/**
 * Extract all parameters necessary for IP creation from params and return
 * them in a new object
 */
function extractParams(params, override) {
    if (!override) {
        override = {};
    }

    var newParams = {};
    CREATE_PARAMS.forEach(function (s) {
        if (params.hasOwnProperty(s)) {
            newParams[s] = params[s];
        }

        if (override.hasOwnProperty(s)) {
            newParams[s] = override[s];
        }
    });

    return newParams;
}


/**
 * Initializes the nic tags bucket
 */
function initIPbucket(app, log, networkUUID, callback) {
    var ipBucket = common.getBucketObj(networkUUID);
    mod_moray.initBucket(app.moray, ipBucket, callback);
}



module.exports = {
    batchCreate: batchCreateIPs,
    bucket: common.getBucketObj,
    bucketInit: initIPbucket,
    bucketName: common.bucketName,
    create: createIP,
    createUpdated: createUpdatedObject,
    del: deleteIP,
    get: getIP,
    IP: common.IP,
    list: listNetworkIPs,
    nextIPonNetwork: require('./provision').nextIPonNetwork,
    params: extractParams,
    update: updateIP
};
