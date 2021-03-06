/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2015, Joyent, Inc.
 */

/*
 * Error classes and helpers
 */

var assert = require('assert-plus');
var restify = require('restify');
var util = require('util');



// --- Globals



var MSG = {
    duplicate: 'Already exists',
    invalidParam: 'Invalid parameters',
    missingParam: 'Missing parameter',
    missingParams: 'Missing parameters'
};



// --- Error classes



/**
 * Base class for invalid / missing parameters
 */
function InvalidParamsError(message, errors) {
    assert.string(message, 'message');
    assert.arrayOfObject(errors, 'errors');

    restify.RestError.call(this, {
        restCode: 'InvalidParameters',
        statusCode: 422,
        message: message,
        body: {
            code: 'InvalidParameters',
            message: message,
            errors: errors
        }
    });

    this.name = 'InvalidParamsError';
}

util.inherits(InvalidParamsError, restify.RestError);


/**
 * Base class for errors due to resources in use
 */
function InUseError(message, errors) {
    assert.string(message, 'message');
    assert.arrayOfObject(errors, 'errors');

    restify.InvalidArgumentError.call(this, {
        restCode: 'InUse',
        statusCode: 422,
        message: message,
        body: {
            code: 'InUse',
            message: message,
            errors: errors
        }
    });

    this.name = 'InUseError';
}

util.inherits(InUseError, restify.InvalidArgumentError);


/**
 * Base class for subnet full error
 */
function SubnetFullError(message) {
    assert.string(message, 'message');

    restify.RestError.call(this, {
        restCode: 'SubnetFull',
        statusCode: 507,
        message: message,
        body: {
            code: 'SubnetFull',
            message: message
        }
    });

    this.name = 'SubnetFullError';
}

util.inherits(SubnetFullError, restify.RestError);



// --- Functions for building elements in a response's errors array



/*
 * Error response for duplicate parameters
 */
function duplicateParam(field, message) {
    assert.string(field, 'field');

    return {
        field: field,
        code: 'Duplicate',
        message: message || MSG.duplicate
    };
}


/**
 * Error response for invalid parameters
 */
function invalidParam(field, message, extra) {
    assert.string(field, 'field');

    var param = {
        field: field,
        code: 'InvalidParameter',
        message: message || MSG.invalidParam
    };

    if (extra) {
        for (var e in extra) {
            param[e] = extra[e];
        }
    }

    return param;
}


/**
 * Error response for missing parameters
 */
function missingParam(field, message) {
    assert.string(field, 'field');

    return {
        field: field,
        code: 'MissingParameter',
        message: message || MSG.missingParam
    };
}


/**
 * Error response for overlapping subnets
 */
function networkOverlapParams(nets) {
    return nets.map(function (net) {
        return usedByParam('subnet', 'network', net.uuid,
            'subnet overlaps with another network');
    }).sort(function (a, b) {
        return (a.id > b.id) ? 1 : -1;
    });
}


/**
 * Error response for an item in use
 */
function usedBy(type, id, message) {
    assert.string(type, 'type');
    assert.string(id, 'id');

    return {
        type: type,
        id: id,
        code: 'UsedBy',
        message: message || util.format('In use by %s "%s"', type, id)
    };
}


/**
 * Error response for a parameter in use
 */
function usedByParam(field, type, id, message) {
    assert.string(field, 'field');
    var paramErr = usedBy(type, id, message);
    paramErr.field = field;
    return paramErr;
}



module.exports = {
    duplicateParam: duplicateParam,
    invalidParam: invalidParam,
    InvalidParamsError: InvalidParamsError,
    InUseError: InUseError,
    missingParam: missingParam,
    msg: MSG,
    networkOverlapParams: networkOverlapParams,
    SubnetFullError: SubnetFullError,
    usedBy: usedBy,
    usedByParam: usedByParam
};
