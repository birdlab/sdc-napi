---
title: Networking API (NAPI)
apisections: Nic Tags, Networks, IPs, Nics, Network Pools, Search, Link Aggregations
markdown2extras: tables, code-friendly
---
<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# Networking API (NAPI)


# Introduction to the Networking API


## What is NAPI?

The Networking API allows for administering the following:

* Nic Tags
* Logical Networks
* Logical Network Pools
* IPs
* Nics
* Link Aggregations

NAPI itself is just a directory of the above - it does not handle communicating
these changes to servers, which is the domain of
[VMAPI](https://mo.joyent.com/docs/vmapi/master) and
[CNAPI](https://mo.joyent.com/docs/cnapi/master).


## IP and Nic Provisioning

When you [create a Nic](#CreateNic) in NAPI, you can specify a MAC address and
IP address. If you do not pick a MAC address, one will be generated at random
for the new nic. If you do not pick an IP address, the next available address
on the logical network will be used.  The next available address is chosen
in the following way:

* If there are IPs in the network that have never been used, pick the lowest
  one that doesn't have belongs_to_uuid set and is unreserved.
* If all IPs in the network have been used before, pick the least
  recently used unreserved IP.

Based on the above, [setting the **reserved** property on an IP](#UpdateIP)
removes it from the automatic selection process. It can still be used by
specifying it as **ip** when [creating a Nic](#CreateNic).
[Setting the **free** property on an IP](#UpdateIP) removes all other
properties from the IP (including **reserved**, **belongs_to_uuid**, and
**belongs_to_type**).  This therefore makes the IP available for automatic
provisioning again.


# Nic Tags

These endpoints manage nic tags.


## ListNicTags (GET /nic_tags)

Returns a list of all nic tags.

### Example

    GET /nic_tags
    [
      {
        "uuid": "bc7e140a-f1fe-49fd-8b70-26379fa04492",
        "name": "admin"
      },
      {
        "uuid": "99ec3b5a-4291-4a40-ba0d-abf7ba1e6e4f",
        "name": "external"
      }
    ]


## GetNicTag (GET /nic_tags/:name)

Returns the named nic tag.

### Example

    GET /nic_tags/admin
    {
      "uuid": "bc7e140a-f1fe-49fd-8b70-26379fa04492",
      "name": "admin"
    }


## CreateNicTag (POST /nic_tags)

Creates a nic tag.

### Inputs

| Field | Type   | Description  |
| ----- | ------ | ------------ |
| name  | String | nic tag name |

### Example

    POST /nic_tags
        -d name=internal
    {
      "uuid": "856e77b0-c0b2-4a6a-8c17-4ec1017360af",
      "name": "internal"
    }


## UpdateNicTag (PUT /nic_tags/:name)

Updates a nic tag.

### Inputs

| Field | Type   | Description      |
| ----- | ------ | ---------------- |
| name  | String | new nic tag name |

### Example

    PUT /nic_tags/internal
        -d name=private
    {
      "uuid": "df4c1682-a77d-11e2-aafc-5354b5c883c7",
      "name": "private"
    }


## DeleteNicTag (DELETE /nic_tags/:name)

Deletes a nic tag.

### Inputs

None.

### Returns

No response payload, only a "204 No Content" response status.



# Networks

These endpoints manage logical networks.


## ListNetworks (GET /networks)

Returns a list of all logical networks.

### Inputs

All parameters are optional filters on the list. A network will be listed if
it matches *all* of the input parameters.

| Field            | Type    | Description                                               |
| ---------------- | ------- | --------------------------------------------------------- |
| name             | String  | network name                                              |
| vlan_id          | Integer | VLAN ID                                                   |
| nic_tag          | String  | Nic Tag name                                              |
| provisionable_by | UUID    | Return networks that are provisionable by this owner_uuid |


**Notes:**

* *provisionable_by* is intended to list networks that a UFDS user can
  provision on. This includes both networks that have that user as its
  owner_uuid and networks with no owner_uuid.

### Example

    GET /networks
    [
      {
        "uuid": "1275886f-3fdf-456e-bba6-28e0e2eab58f",
        "name": "admin",
        "vlan_id": 0,
        "subnet": "10.99.99.0/24",
        "netmask": "255.255.255.0",
        "provision_start_ip": "10.99.99.189",
        "provision_end_ip": "10.99.99.250",
        "resolvers": [
          "8.8.4.4",
          "8.8.8.8"
        ],
        "gateway": "10.99.99.7"
      },
      {
        "uuid": "c9306c59-f0d6-4aa0-aa0c-17d22a6a3f0f",
        "name": "external",
        "vlan_id": 128,
        "subnet": "10.88.88.0/24",
        "netmask": "255.255.255.0",
        "provision_start_ip": "10.88.88.189",
        "provision_end_ip": "10.88.88.250",
        "resolvers": [
          "8.8.4.4",
          "8.8.8.8"
        ],
        "gateway": "10.88.88.2"
      }
    ]


## CreateNetwork (POST /networks)

Creates a new logical network

### Inputs

| Field              | Type           | Description                                                     |
| ------------------ | -------------- | --------------------------------------------------------------- |
| name               | String         | network name                                                    |
| vlan_id            | Number         | VLAN ID (0 if no VLAN ID)                                       |
| subnet             | CIDR           | Subnet                                                          |
| provision_start_ip | IP             | First IP address to allow provisioning on                       |
| provision_end_ip   | IP             | Last IP address to allow provisioning on                        |
| nic_tag            | String         | Name of the nic tag that this logical network is over           |
| gateway            | IP             | Gateway IP address (Optional)                                   |
| resolvers          | Array of IPs   | Resolver IP addresses (Optional)                                |
| routes             | Routes Object  | Static routes for hosts on this network (Optional)              |
| owner_uuids        | Array of UUIDs | UFDS user UUIDs allowed to provision on this network (Optional) |
| description        | String         | Description (Optional)                                          |

**Notes:**

* The provisioning range of provision_start_ip to provision_end_ip is inclusive.
* Specifying owner_uuids for a network limits the owner_uuid of nics and IPs
  created on the network to those owner_uuids or the UFDS admin UUID.


### Routes object

The routes object is a JSON object where the keys are the IP or subnet
destinations, and the values are the gateways for those destinations. For
example:

    {
        "10.88.88.0/24": "10.99.99.7",
        "10.77.77.2": "10.99.99.254"
    }

This sets two static routes:

* subnet 10.88.88.0/24 through the gateway 10.99.99.7
* host 10.77.77.2 through the gateway 10.99.99.254


### Example

    POST /networks
        name=internal
        vlan_id=401
        subnet=10.0.2.0/24
        provision_start_ip=10.0.2.5
        provision_end_ip=10.0.2.250
        nic_tag=internal
        gateway=10.0.2.1
    {
      "uuid": "dcb499bd-1caf-4ff6-8d70-4e6d5c02dff3",
      "name": "internal",
      "vlan_id": 401,
      "subnet": "10.0.2.0/24",
      "netmask": "255.255.255.0",
      "provision_start_ip": "10.0.2.5",
      "provision_end_ip": "10.0.2.250",
      "nic_tag": "internal",
      "resolvers": [],
      "gateway": "10.0.2.1"
    }


## UpdateNetwork (PUT /networks/:network_uuid)

Updates a logical network.  Note updating the following parameters will cause
a workflow to be run to update VMs on that network with the changes:

* resolvers
* routes
* gateway

### Inputs

All fields are optional. At least one must be specified. Only the parameters
specified in the update are changed, leaving all others unchanged.

| Field              | Type           | Description                                                                       |
| ------------------ | -------------- | --------------------------------------------------------------------------------- |
| name               | String         | network name                                                                      |
| gateway            | IP             | Gateway IP address                                                                |
| provision_start_ip | IP             | First IP address to allow provisioning on                                         |
| provision_end_ip   | IP             | Last IP address to allow provisioning on                                          |
| resolvers          | Array of IPs   | Resolver IP addresses                                                             |
| routes             | Routes Object  | Static routes for hosts on this network (See the Routes Object description above) |
| owner_uuids        | Array of UUIDs | UFDS user UUIDs allowed to provision on this network                              |
| description        | String         | Description                                                                       |

**Notes:**

* The provisioning range of provision_start_ip to provision_end_ip is inclusive.
* Specifying owner_uuids for a network limits the owner_uuid of nics and IPs
  created on the network to those owner_uuids or the UFDS admin UUID.
* If one of the parameters causing a workflow to run is changed, the response
  will include a *job_uuid* field that can be used to obtain the job details
  from the workflow API.

### Example

    PUT /networks/2c670e67-bcd1-44c8-b59c-aaf7d8cfa17b
        description="Admin network"
        routes={ "10.88.88.0/24": "10.99.99.7" }

    {
      "uuid": "2c670e67-bcd1-44c8-b59c-aaf7d8cfa17b",
      "name": "admin",
      "vlan_id": 0,
      "subnet": "10.99.99.0/24",
      "netmask": "255.255.255.0",
      "provision_start_ip": "10.99.99.37",
      "provision_end_ip": "10.99.99.253",
      "nic_tag": "admin",
      "resolvers": [
        "10.99.99.11"
      ],
      "routes": {
        "10.88.88.0/24": "10.99.99.7"
      },
      "owner_uuids": [
        "930896af-bf8c-48d4-885c-6573a94b1853"
      ],
      "description": "Admin network",
      "job_uuid": "fdeb7f1a-24ee-40a0-899f-736e68ffae39"
    }


## GetNetwork (GET /networks/:network_uuid)

Gets a logical network by UUID.

### Inputs

All fields are optional.

| Field            | Type | Description                                                         |
| ---------------- | ---- | ------------------------------------------------------------------- |
| provisionable_by | UUID | Check whether network is allowed to be provisioned by an owner UUID |

### Example

    GET /networks/dcb499bd-1caf-4ff6-8d70-4e6d5c02dff3
    {
      "uuid": "dcb499bd-1caf-4ff6-8d70-4e6d5c02dff3",
      "name": "internal",
      "vlan_id": 401,
      "subnet": "10.0.2.0/24",
      "netmask": "255.255.255.0",
      "provision_start_ip": "10.0.2.5",
      "provision_end_ip": "10.0.2.250",
      "nic_tag": "internal",
      "resolvers": [],
      "gateway": "10.0.2.1"
    }


## DeleteNetwork (DELETE /networks/:network_uuid)

Deletes a network.

### Inputs

None.

### Returns

No response payload, only a "204 No Content" response status.


## ProvisionNic (POST /networks/:network_uuid/nics)

Creates a new nic, provisioning an IP and MAC address in the process.

### Inputs

| Field             | Type                   | Description                                                                      |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------- |
| owner_uuid        | UUID                   | Nic Owner                                                                        |
| belongs_to_uuid   | UUID                   | The UUID of what this Nic belongs to                                             |
| belongs_to_type   | String                 | The type that this belongs to (eg: 'zone', 'server')                             |
| ip                | String                 | IP address to assign to the nic                                                  |
| reserved          | Boolean                | Whether the IP address should be reserved                                        |
| nic_tags_provided | Array of nic tag names | Nic tags this nic provides                                                       |
| check_owner       | Boolean                | If set to false, skips network ownership checks (optional)                       |
| status            | String                 | Set state nic starts in (one of 'provisioning', 'stopped', 'running') (optional) |

**Notes:**

### Example

    POST /networks/1275886f-3fdf-456e-bba6-28e0e2eab58f/nics
        -d owner_uuid=930896af-bf8c-48d4-885c-6573a94b1853
        -d belongs_to_uuid=a112b8aa-eb39-4f84-8257-17a705880773
        -d belongs_to_type=zone

    {
      "ip": "10.99.99.240",
      "netmask": "255.255.255.0",
      "vlan_id": 0,
      "nic_tag": "admin",
      "mac": "90:b8:d0:f3:f8:8b",
      "primary": false,
      "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
      "belongs_to_uuid": "a112b8aa-eb39-4f84-8257-17a705880773",
      "belongs_to_type": "zone",
      "gateway": "10.99.99.7",
      "status": "running",
      "resolvers": [
        "8.8.4.4",
        "8.8.8.8"
      ]
    }



# IPs

These endpoints manage IPs on a logical network.

## ListIPs (GET /networks/:network_uuid/ips)

Gets all of the IPs in use on that Logical Network.

### Example

    GET /networks/1275886f-3fdf-456e-bba6-28e0e2eab58f/ips

    [
      {
        "ip": "10.99.99.9",
        "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
        "belongs_to_uuid": "d66d8047-5c23-42a1-a26a-60ee806f7edb",
        "belongs_to_type": "zone",
        "netmask": "255.255.255.0",
        "gateway": "10.99.99.7",
        "nic": "c2:df:ef:11:48:48"
      },
      {
        "ip": "10.99.99.10",
        "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
        "belongs_to_uuid": "671819b2-5017-4337-8c85-e5658e632955",
        "belongs_to_type": "zone",
        "netmask": "255.255.255.0",
        "gateway": "10.99.99.7",
        "nic": "c2:e0:04:1e:c7:8a"
      }
    ]



## GetIP (GET /networks/:network_uuid/ips/:ip_address)

Gets a specific IP on a Logical Network.

### Example

    GET /networks/b330e2a1-6260-41a8-8567-a8a011f202f1/ips/10.88.88.106

    {
      "ip": "10.88.88.106",
      "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
      "belongs_to_uuid": "0e56fe34-39a3-42d5-86c7-d719487f892b",
      "belongs_to_type": "zone",
      "netmask": "255.255.255.0",
      "gateway": "10.88.88.2",
      "nic": "90:b8:d0:55:57:2f"
    }


## UpdateIP (PUT /networks/:network_uuid/ips/:ip_address)

Modifies a specific IP on a Logical Network.

### Inputs

| Field           | Type    | Description                                                                                         |
| --------------- | ------- | --------------------------------------------------------------------------------------------------- |
| owner_uuid      | UUID    | IP Owner                                                                                            |
| belongs_to_uuid | UUID    | The UUID of what this IP belongs to                                                                 |
| belongs_to_type | String  | The type that this belongs to (eg: 'zone', 'server')                                                |
| reserved        | Boolean | Whether the IP address should be reserved                                                           |
| unassign        | Boolean | When set, removes belongs_to_uuid and belongs_to_type, ignoring all other parameters in the request |
| check_owner     | Boolean | If set to false, skips network ownership checks (optional)                                          |

### Reserved IPs

Reserving an IP removes an IP address from the provisioning pool, which means
that IPs [provisioned on that network](#CreateNic) will not get that address.
Note that you can still provision a nic with this IP address, but you must
specify the IP when provisioning.

In addition, when you [delete a nic](#DeleteNic) with a reserved IP, the IP
**keeps its owner_uuid**, but its belongs_to_uuid and belongs_to_type are
removed (similar to the *unassign* option above).


### Example: reserving an IP

    PUT /networks/91daaada-4c62-4b80-9de8-0bd09895f86e/ips/10.99.99.77
        reserved=true

    {
      "ip": "10.99.99.77",
      "reserved": true,
      "free": false
    }



# Nics

These endpoints manage nics.


## ListNics (GET /nics)

Returns a list of all nics.

### Inputs

All parameters are optional filters on the list. A nic is output in the list
if it matches *all* of the input parameters.

| Field             | Type                   | Description                                          |
| ----------------- | ---------------------- | ---------------------------------------------------- |
| owner_uuid        | UUID                   | Nic Owner                                            |
| belongs_to_uuid   | UUID                   | The UUID of what this Nic belongs to                 |
| belongs_to_type   | String                 | The type that this belongs to (eg: 'zone', 'server') |
| nic_tag           | String                 | The nic tag that this nic is on                      |
| nic_tags_provided | Array of nic tag names | Nic tags provided by the nic                         |

Note: all filter fields above can have multiple comma-separated values to search
on (like a logical OR).

### Example: list all nics

    GET /nics

    [
      {
        "ip": "10.88.88.190",
        "netmask": "255.255.255.0",
        "vlan_id": 0,
        "nic_tag": "external",
        "mac": "90:b8:d0:b6:a2:86",
        "primary": false,
        "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
        "belongs_to_uuid": "27391a96-9fb5-4896-975a-85f948d9c509",
        "belongs_to_type": "zone",
        "gateway": "10.88.88.2",
        "status": "running",
        "resolvers": [
          "8.8.4.4",
          "8.8.8.8"
        ]
      },
      {
        "ip": "10.88.88.220",
        "netmask": "255.255.255.0",
        "vlan_id": 0,
        "nic_tag": "external",
        "mac": "90:b8:d0:bb:28:8b",
        "primary": false,
        "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
        "belongs_to_uuid": "27391a96-9fb5-4896-975a-85f948d9c509",
        "belongs_to_type": "zone",
        "gateway": "10.88.88.2",
        "status": "running",
        "resolvers": [
          "8.8.4.4",
          "8.8.8.8"
        ]
      },
      ...
    ]


### Example: list all nics with a nic tag of external or admin

    GET /nics?nic_tag=external,admin

    [
      {
        "mac": "c2:e0:09:bb:a5:3b",
        "primary": false,
        "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
        "belongs_to_uuid": "0e56fe34-39a3-42d5-86c7-d719487f892b",
        "belongs_to_type": "zone",
        "ip": "10.99.99.19",
        "netmask": "255.255.255.0",
        "vlan_id": 0,
        "nic_tag": "admin",
        "gateway": "10.99.99.7",
        "status": "running",
        "resolvers": [
          "8.8.8.8",
          "8.8.4.4"
        ]
      },
      {
        "mac": "90:b8:d0:b0:e6:d0",
        "primary": false,
        "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
        "belongs_to_uuid": "7896fd2d-0b6b-4e96-9e92-c3c7247bfe71",
        "belongs_to_type": "zone",
        "ip": "10.88.88.120",
        "netmask": "255.255.255.0",
        "vlan_id": 0,
        "nic_tag": "external",
        "gateway": "10.88.88.2",
        "status": "running",
        "resolvers": [
          "8.8.8.8",
          "8.8.4.4"
        ]
      },
      ...
    ]


### Example: list all nics belonging to servers that provide an admin or external nic tag

    GET /nics?belongs_to_type=server&nic_tags_provided=admin,external | json -Hamac nic_tags_provided

    00:50:56:3d:a7:95 [
      "external"
    ]
    00:50:56:34:60:4c [
      "admin"
    ]



## CreateNic (POST /nics)

Creates a new nic.

| Field                    | Type                   | Description                                                                       |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------- |
| mac                      | String                 | MAC address                                                                       |
| owner_uuid               | UUID                   | Nic Owner                                                                         |
| belongs_to_uuid          | UUID                   | The UUID of what this Nic belongs to                                              |
| belongs_to_type          | String                 | The type that this belongs to (eg: 'zone', 'server')                              |
| ip                       | String                 | IP address to assign to the nic                                                   |
| network_uuid             | UUID                   | UUID of the network or network pool to provision an IP on                         |
| nic_tag                  | String                 | Nic tag (required if IP specified)                                                |
| vlan_id                  | Number                 | VLAN ID (required if IP specified)                                                |
| reserved                 | Boolean                | Whether the IP address should be reserved                                         |
| nic_tags_provided        | Array of nic tag names | Nic tags this nic provides                                                        |
| model                    | String                 | Nic model for KVM VMs (optional for other VM types)                               |
| check_owner              | Boolean                | If set to false, skips network ownership checks (optional)                        |
| status                   | String                 | Set state nic starts in (one of 'provisioning', 'stopped', 'running') (optional)  |
| allow_dhcp_spoofing      | Boolean                | Allow operating a DHCP server on this nic                                         |
| allow_ip_spoofing        | Boolean                | Allow sending and receiving packets that don't match the nic's IP                 |
| allow_mac_spoofing       | Boolean                | Allow sending and receiving packets that don't match the nic's MAC address        |
| allow_restricted_traffic | Boolean                | Allow sending restricted network traffic (packets that are not IPv4, IPv6 or ARP) |
| allow_unfiltered_promisc | Boolean                | Allow this VM to have multiple MAC addresses                                      |


### Example

    POST /nics
        -d mac=00:50:56:34:60:4c
        -d owner_uuid=930896af-bf8c-48d4-885c-6573a94b1853
        -d belongs_to_uuid=564da1dd-cea7-9cc6-1059-cca75970c802
        -d belongs_to_type=server
    {
      "mac": "00:50:56:34:60:4c",
      "primary": false,
      "owner_uuid": "930896af-bf8c-48d4-885c-6573a94b1853",
      "belongs_to_uuid": "564da1dd-cea7-9cc6-1059-cca75970c802",
      "belongs_to_type": "server"
    }


## GetNic (GET /nics/:mac_address)

Returns the nic with the given MAC address.

**Note: this is the MAC address with all colons removed.**

### Example

    GET /nics/90b8d0575370

    {
      "ip": "10.88.88.198",
      "netmask": "255.255.255.0",
      "vlan_id": 0,
      "nic_tag": "external",
      "mac": "90:b8:d0:57:53:70",
      "primary": false,
      "owner_uuid": "aaaaaaaf-bf8c-48d4-885c-6573a94b1853",
      "belongs_to_uuid": "27391a96-bbbb-bbbb-bbbb-85f948d9c509",
      "belongs_to_type": "zone",
      "gateway": "10.88.88.2",
      "status": "running",
      "resolvers": [
        "8.8.4.4",
        "8.8.8.8"
      ]
    }


## UpdateNic (PUT /nics/:mac_address)

Changes properties of the nic with the given MAC address.

| Field                    | Type                   | Description                                                                       |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------- |
| owner_uuid               | UUID                   | Nic Owner                                                                         |
| belongs_to_uuid          | UUID                   | The UUID of what this Nic belongs to                                              |
| belongs_to_type          | String                 | The type that this belongs to (eg: 'zone', 'server')                              |
| ip                       | String                 | IP address to assign to the nic                                                   |
| network_uuid             | UUID                   | The network UUID the nic's IP should be on                                        |
| nic_tags_provided        | Array of nic tag names | Nic tags this nic provides                                                        |
| model                    | String                 | Nic model for KVM VMs (optional for other VM types)                               |
| check_owner              | Boolean                | If set to false, skips network ownership checks (optional)                        |
| allow_dhcp_spoofing      | Boolean                | Allow operating a DHCP server on this nic                                         |
| allow_ip_spoofing        | Boolean                | Allow sending and receiving packets that don't match the nic's IP                 |
| allow_mac_spoofing       | Boolean                | Allow sending and receiving packets that don't match the nic's MAC address        |
| allow_restricted_traffic | Boolean                | Allow sending restricted network traffic (packets that are not IPv4, IPv6 or ARP) |
| allow_unfiltered_promisc | Boolean                | Allow this VM to have multiple MAC addresses                                      |


**Note: this is the MAC address with all colons removed.**

### Example

    PUT /nics/90b8d0575370
        -d belongs_to_uuid=27391a96-bbbb-bbbb-bbbb-888888888888
        -d belongs_to_type=server
        -d status=stopped

    {
      "ip": "10.88.88.198",
      "netmask": "255.255.255.0",
      "vlan_id": 0,
      "nic_tag": "external",
      "mac": "90:b8:d0:57:53:70",
      "primary": false,
      "owner_uuid": "aaaaaaaf-bf8c-48d4-885c-6573a94b1853",
      "belongs_to_uuid": "27391a96-bbbb-bbbb-bbbb-888888888888",
      "belongs_to_type": "server",
      "gateway": "10.88.88.2",
      "status": "stopped",
      "resolvers": [
        "8.8.4.4",
        "8.8.8.8"
      ]
    }


## DeleteNic (DELETE /nics/:mac_address)

Deletes the nic with the given MAC address, freeing any IPs that belong to
that nic in the process. If the IP address is reserved, its reserved and
owner_uuid properties will be preserved.

**Note: this is the MAC address with all colons removed.**

### Inputs

None.

### Returns

No response payload, only a "204 No Content" response status.



# Network Pools

These endpoints manage logical network provisioning pools.  These are
collections of logical networks that can be used when
[provisioning a nic](#CreateNic). The ordering of the networks property
of a pool is significant: NAPI will go try to provision an IP on each network
in this list in succession, until it succeeds or runs out of networks.


## ListNetworkPools (GET /network_pools)

Returns a list of all logical network pools.

### Inputs

All parameters are optional filters on the list. A network pool will be listed
if it matches *all* of the input parameters.

| Field            | Type | Description                                                    |
| ---------------- | ---- | -------------------------------------------------------------- |
| provisionable_by | UUID | Return network pools that are provisionable by this owner_uuid |

### Example

    GET /network_pools
    [
      {
        "uuid": "3b5913ec-42e6-4803-9c0b-c9b1c5603520",
        "name": "internal",
        "networks": [
          "0e70de36-a40b-4ac0-9429-819f5ff822bd",
          "9f2eada0-529b-4673-a377-c249f9240a12"
        ]
      },
      {
        "uuid": "e967a42b-312d-490c-b753-c4768d9f2091",
        "name": "external",
        "networks": [
          "57a83e2b-527c-41c1-983c-be9b792011dc",
          "8ba8a35f-3eb3-496b-8103-8238eb40f9d0"
        ]
      }
    ]


## CreateNetworkPool (POST /network_pools)

Creates a new logical network provisioning pool.

### Inputs

| Field       | Type           | Description                                                          |
| ----------- | -------------- | -------------------------------------------------------------------- |
| name        | String         | network provisioning pool name                                       |
| networks    | Array of UUIDs | Logical Network UUIDs                                                |
| owner_uuids | Array of UUIDs | UFDS user UUIDs allowed to provision on this network pool (Optional) |

**Notes:**

* Specifying owner_uuids for a pool limits the networks in that pool to those
  with either no owner_uuid or matching one of the owner_uuids. You can
  therefore only provision nics or IPs on a network in the pool according to
  its [owner_uuid limitations](#CreateNetwork).

### Example

    POST /network_pools
        name=internal
        networks=0e70de36-a40b-4ac0-9429-819f5ff822bd,9f2eada0-529b-4673-a377-c249f9240a12
    {
      "uuid": "3b5913ec-42e6-4803-9c0b-c9b1c5603520",
      "name": "internal",
      "networks": [
        "0e70de36-a40b-4ac0-9429-819f5ff822bd",
        "9f2eada0-529b-4673-a377-c249f9240a12"
      ]
    }


## GetNetworkPool (GET /network_pools/:uuid)

Gets a logical network provisioning pool by UUID.

### Example

    GET /network_pools/3b5913ec-42e6-4803-9c0b-c9b1c5603520
    {
      "uuid": "3b5913ec-42e6-4803-9c0b-c9b1c5603520",
      "name": "internal",
      "networks": [
        "0e70de36-a40b-4ac0-9429-819f5ff822bd",
        "9f2eada0-529b-4673-a377-c249f9240a12"
      ]
    }


## UpdateNetworkPool (PUT /network_pools/:uuid)

Changes a logical network provisioning pool.

### Inputs

Must specify at least one of:

| Field    | Type           | Description                    |
| -------- | -------------- | ------------------------------ |
| name     | String         | network provisioning pool name |
| networks | Array of UUIDs | Logical Network UUIDs          |

### Example

    PUT /network_pools/3b5913ec-42e6-4803-9c0b-c9b1c5603520
        name=internal2
    {
      "uuid": "3b5913ec-42e6-4803-9c0b-c9b1c5603520",
      "name": "internal2",
      "networks": [
        "0e70de36-a40b-4ac0-9429-819f5ff822bd",
        "9f2eada0-529b-4673-a377-c249f9240a12"
      ]
    }


## DeleteNetworkPool (DELETE /network_pools/:uuid)

Deletes a network pool.

### Inputs

None.

### Returns

No response payload, only a "204 No Content" response status.



# Search

These endpoints are for searching the various components of NAPI.


## SearchIPs (GET /search/ips)

Searches IPs across all logical networks.


### Inputs

| Field | Type       | Description                         |
| ----- | ---------- | ----------------------------------- |
| ip    | IP address | IP address to search for (required) |


### Example

    GET /search/ips?ip=10.77.77.1
    [
      {
        "ip": "10.77.77.1",
        "reserved": false,
        "free": false,
        "belongs_to_type": "zone",
        "belongs_to_uuid": "807223ae-bcc7-11e2-841a-3bf662b0a0c3",
        "owner_uuid": "8d40ace0-bcc7-11e2-9bae-575fff7de171",
        "network_uuid": "1d0dd3de-1d8b-4f31-a58a-284eb2d9335f"
      },
      {
        "ip": "10.77.77.1",
        "reserved": false,
        "free": true,
        "network_uuid": "210ed836-737a-4dfe-97f9-a9f5f6811581"
      }
    ]



# Link Aggregations

These endpoints manage link aggregations.


## ListAggregations (GET /aggregations)

Returns a list of aggregations, optionally filtered by parameters.

### Inputs

All parameters are optional filters on the list.

| Field             | Type                   | Description                                             |
| ----------------- | ---------------------- | ------------------------------------------------------- |
| belongs_to_uuid   | UUID                   | The UUID of the Compute Node the aggregation belongs to |
| macs              | Array of MAC addresses | MAC addresses of nics in the aggregation                |
| nic_tags_provided | Array of nic tag names | Nic tags provided by the nic                            |

### Example

    GET /aggregations
    [
        {
          "belongs_to_uuid": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e",
          "id": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e-aggr0",
          "lacp_mode": "active",
          "name": "aggr0",
          "macs": [
            "00:0c:29:a1:d5:48",
            "00:0c:29:a1:d5:52"
          ],
          "nic_tags_provided": [
            "admin",
            "internal"
          ]
        }
    ]


## GetAggregation (GET /aggregations/:id)

Returns an aggregation.

### Example

    GET /aggregations/564d4d2c-ddd0-7be7-40ae-bae473a1d53e-aggr0
    {
      "belongs_to_uuid": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e",
      "id": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e-aggr0",
      "lacp_mode": "active",
      "name": "aggr0",
      "macs": [
        "00:0c:29:a1:d5:48",
        "00:0c:29:a1:d5:52"
      ],
      "nic_tags_provided": [
        "admin",
        "internal"
      ]
    }


## CreateAggregation (POST /aggregations)

Creates an aggregation.

### Inputs

| Field             | Type                   | Description                                                                            |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| name              | String                 | aggregation name (**required**)                                                        |
| lacp_mode         | String                 | aggregation LACP mode: can be active, passive or off (default: off)                    |
| macs              | Array of Strings       | MAC addresses of links in the aggregation (**required**)                               |
| nic_tags_provided | Array of nic tag names | nic tags that this aggregation provides (same parameter as in [CreateNic](#CreateNic)) |

### Example

    POST /aggregations
        name=aggr0
        macs=00:0c:29:a1:d5:48,00:0c:29:a1:d5:52
        lacp_mode=active
        nic_tags_provided=admin,internal

    {
      "belongs_to_uuid": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e",
      "id": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e-aggr0",
      "lacp_mode": "active",
      "name": "aggr0",
      "macs": [
        "00:0c:29:a1:d5:48",
        "00:0c:29:a1:d5:52"
      ],
      "nic_tags_provided": [
        "admin",
        "internal"
      ]
    }


## UpdateAggregation (PUT /aggregations/:id)

Updates an aggregation.

### Inputs

| Field             | Type                   | Description                                                                            |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| lacp_mode         | String                 | aggregation LACP mode: can be active, passive or off (default: off)                    |
| macs              | Array of Strings       | MAC addresses of links in the aggregation                                              |
| nic_tags_provided | Array of nic tag names | nic tags that this aggregation provides (same parameter as in [CreateNic](#CreateNic)) |

### Example

    PUT /aggregations/564d4d2c-ddd0-7be7-40ae-bae473a1d53e-aggr0
        lacp_mode=off

    {
      "belongs_to_uuid": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e",
      "id": "564d4d2c-ddd0-7be7-40ae-bae473a1d53e-aggr0",
      "lacp_mode": "off",
      "name": "aggr0",
      "macs": [
        "00:0c:29:a1:d5:48",
        "00:0c:29:a1:d5:52"
      ],
      "nic_tags_provided": [
        "admin",
        "internal"
      ]
    }


## DeleteAggregation (DELETE /aggregations/:id)

Deletes an aggregation.

### Inputs

None.

### Example

    DELETE /aggregations/564d4d2c-ddd0-7be7-40ae-bae473a1d53e-aggr0
    { }


### Returns

No response payload, only a "204 No Content" response status.


## Enabling on a Compute Node

To link aggregation for a compute node, you must perform the following steps:

* Create a link aggregation with the *macs* property set to MAC addresses of
  nics on that Compute Node
* Reboot the Compute Node

Before rebooting the Compute Node, you can confirm that it will get the
correct bootparams on its next boot by using the "booter" command in the
dhcpd zone, like so:

    booter bootparams 00:0c:29:a1:d5:3e | json kernel_args | grep -v rabbit
    {
      "hostname": "00-0c-29-a1-d5-3e",
      "admin_nic": "00:0c:29:a1:d5:3e",
      "internal_nic": "aggr0",
      "aggr0_aggr": "\"00:0c:29:a1:d5:48,00:0c:29:a1:d5:52\"",
      "aggr0_lacp_mode": "off"
    }

In the example above, the node will boot with one aggregation, aggr0, with
2 physical nics in the aggregation.

**Note: changes to aggregations will only take effect at the next reboot
of the Compute Node that hosts them.**


# Changelog

## 2012-07-04

  * Can now pass reserved to POST /nics and POST /networks/:network_uuid/nics
  * Can now do a PUT /networks/:network_uuid/ips/:ip_addr to change the IP's
    reserved property

## 2012-08-20

  * gateway and netmask no longer required when POSTING to /nics with an IP
    address
  * Adding and updating nics now takes an optional nic_tags_provided parameter

## 2012-09-12

  * GET /networks: added vlan_id and nic_tag filters

## 2013-02-07

  * Added network pool endpoints

## 2013-04-17

  * Added network owner_uuid parameter
  * Added provisionable_by parameter to NetworkList endpoint

## 2013-05-01

  * Changed network and network owner_uuid parameter to owner_uuids

## 2013-05-14

  * Added SearchIPs endpoint
  * Added UpdateNetwork endpoint

## 2014-02-18

  * Added aggregations endpoints
