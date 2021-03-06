/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * nic model: deleting
 */

var common = require('./common');
var getNic = require('./get').get;
var mod_ip = require('../ip');
var mod_moray = require('../../apis/moray');
var validate = require('../../util/validate');
var vasync = require('vasync');



// --- Exports



/**
 * Deletes a nic with the given parameters
 */
function del(opts, callback) {
    var app = opts.app;
    var log = opts.log;
    var params = opts.params;
    log.debug(params, 'nic: del: entry');

    var validatedParams;
    var nic;

    vasync.pipeline({
        funcs: [
        function _validate(_, cb) {
            validate.params({
                params: params,
                required: {
                    mac: common.validateMAC
                }
            }, function (err, res) {
                validatedParams = res;
                return cb(err);
            });
        },

        // Need to get nic first, to see if it has an IP we need to delete
        function _get(_, cb) {
            return getNic(opts, function (err, res) {
                nic = res;
                return cb(err);
            });
        },

        function _del(_, cb) {
            return mod_moray.delObj(app.moray, common.BUCKET,
                validatedParams.mac.toString(), function (err) {
                if (err) {
                    log.error({
                        err: err,
                        mac: validatedParams.mac,
                        before: nic.serialize()
                    }, 'Error deleting nic');
                } else {
                    log.info({
                        mac: validatedParams.mac,
                        before: nic.serialize()
                    }, 'Deleted nic');
                }

                return cb(err);
            });
        },

        function _delIP(_, cb) {
            if (!nic || !nic.ip) {
                log.debug('nic: delete: nic "%s" has no IP', params.mac);
                return cb();
            }

            if (nic.ip.params.belongs_to_uuid !== nic.params.belongs_to_uuid) {
                log.debug({ mac: params.mac, ip: nic.ip.address },
                    'nic: delete: IP and nic belongs_to_uuid do not match');
                return cb();
            }

            // XXX: may want some way to override this and force the delete
            if (nic.ip.params.reserved) {
                log.debug('nic: delete: nic "%s" has a reserved IP',
                    params.mac);
                return mod_ip.update(app, log, {
                    ip: nic.ip.number,
                    network: nic.network,
                    network_uuid: nic.network.params.uuid,
                    belongs_to_uuid: nic.ip.params.belongs_to_uuid,
                    belongs_to_type: nic.ip.params.belongs_to_type,
                    unassign: true
                }, cb);

            } else {
                log.debug('nic: delete: nic "%s": deleting IP', params.mac);
                return mod_ip.del(app, log, {
                    network_uuid: nic.network.uuid,
                    ip: nic.ip.number
                }, cb);
            }
        }
    ]}, function (err) {
        if (err) {
            log.error(err, 'nic: delete: error');
        }
        return callback(err);
    });
}



module.exports = {
    del: del
};
