// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

//
// Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
// with the License. A copy of the License is located at
//
// http://aws.amazon.com/apache2.0/
//
// or in the "LICENSE.txt" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
// OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions and
// limitations under the License.

import {setState, getState, clearState, useState} from '../../store'
import {DescribeCluster, GetConfiguration, LoadAwsConfig} from '../../model'
import {getIn, setIn} from '../../util'
import {mapComputeResources} from './Queues/queues.mapper'
import {mapStorageToUiSettings} from './Storage/storage.mapper'
import {Storages} from './Storage.types'
// @ts-expect-error TS(7016) FIXME: Could not find a declaration file for module 'js-y... Remove this comment to see the full error message
import {load} from 'js-yaml'

function loadTemplateLazy(config: any, callback?: () => void) {
  const loadingPath = ['app', 'wizard', 'source', 'loading']
  const subnets = getState(['aws', 'subnets']) || []
  const keypairs = getState(['aws', 'keypairs']) || []
  const keypairNames = new Set(keypairs.map((kp: any) => kp.KeyName))
  const keypairPath = ['HeadNode', 'Ssh', 'KeyName']
  const version = getState(['app', 'wizard', 'version'])
  const defaultRegion = getState(['aws', 'region'])
  if (getIn(config, ['Image', 'CustomAmi']))
    setState(['app', 'wizard', 'customAMI', 'enabled'], true)

  if (!getIn(config, ['Image', 'Os']) && !getIn(config, ['Image', 'CustomAmi']))
    config = setIn(config, ['Image', 'Os'], 'alinux2')

  if (!getIn(config, ['Scheduling', 'Scheduler']))
    config = setIn(config, ['Scheduling', 'Scheduler'], 'slurm')

  if (!getIn(config, ['HeadNode', 'InstanceType']))
    config = setIn(config, ['HeadNode', 'InstanceType'], 't2.micro')

  const subnetIndex = subnets.reduce((acc: any, subnet: any) => {
    acc[subnet.SubnetId] = subnet.VpcId
    return acc
  }, {})

  if (getIn(config, ['HeadNode', 'Networking', 'SubnetId'])) {
    const vpc = getIn(subnetIndex, [
      getIn(config, ['HeadNode', 'Networking', 'SubnetId']),
    ])
    if (vpc) setState(['app', 'wizard', 'vpc'], vpc)
  }

  if (getIn(config, ['DirectoryService']))
    setState(['app', 'wizard', 'multiUser'], true)
  else clearState(['app', 'wizard', 'multiUser'])

  const storages = (getIn(config, ['SharedStorage']) as Storages) || []
  const uiSettings = mapStorageToUiSettings(storages)
  setState(['app', 'wizard', 'storage', 'ui'], uiSettings)

  if (getIn(config, ['Scheduling', 'SlurmQueues'])) {
    let queues = getIn(config, ['Scheduling', 'SlurmQueues'])
    for (let i = 0; i < queues.length; i++) {
      let computeResources = getIn(config, [
        'Scheduling',
        'SlurmQueues',
        i,
        'ComputeResources',
      ])
      computeResources = mapComputeResources(
        version,
        defaultRegion,
        computeResources,
      )
      config = setIn(
        config,
        ['Scheduling', 'SlurmQueues', i, 'ComputeResources'],
        computeResources,
      )
      for (let j = 0; j < computeResources.length; j++) {
        if (
          getIn(config, [
            'Scheduling',
            'SlurmQueues',
            i,
            'ComputeResources',
            j,
            'Efa',
            'Enabled',
          ])
        ) {
          let gdr = getIn(config, [
            'Scheduling',
            'SlurmQueues',
            i,
            'ComputeResources',
            j,
            'Efa',
            'GdrSupport',
          ])
          if (gdr !== true && gdr !== false)
            config = setIn(
              config,
              [
                'Scheduling',
                'SlurmQueues',
                i,
                'ComputeResources',
                j,
                'Efa',
                'GdrSupport',
              ],
              true,
            )
        }
      }
    }
  }

  // Don't override defaults
  setState(['app', 'wizard', 'loaded'], true)
  setState(['app', 'wizard', 'config'], config)

  if (keypairs.length > 0 && !keypairNames.has(getIn(config, keypairPath)))
    setState(['app', 'wizard', 'config', ...keypairPath], keypairs[0].KeyName)
  setState(['app', 'wizard', 'page'], 'version')

  console.log('config: ', getState(['app', 'wizard', 'config']))

  setState(loadingPath, false)
  callback && callback()
}

export default function loadTemplate(config: any, callback?: () => void) {
  const loadingPath = ['app', 'wizard', 'source', 'loading']
  let defaultRegion = getState(['aws', 'region']) || ''
  const region = getState(['app', 'selectedRegion']) || defaultRegion

  setState(loadingPath, true)

  if (!getIn(config, ['Region']) || region === getIn(config, ['Region'])) {
    config['Region'] = region
    loadTemplateLazy(config)
  } else {
    const chosenRegion = config.Region
    setState(['app', 'wizard', 'config', 'Region'], chosenRegion)
    LoadAwsConfig(chosenRegion, () => loadTemplateLazy(config, callback))
  }
}

function subnetName(subnet: any) {
  if (!subnet) return null
  var tags = subnet.Tags
  if (!tags) {
    return null
  }
  tags = subnet.Tags.filter((t: any) => {
    return t.Key === 'Name'
  })
  return tags.length > 0 ? tags[0].Value : null
}

const wizardLoadingPath = ['app', 'wizard', 'source', 'loading']

function loadTemplateFromCluster(clusterName: string) {
  setState(wizardLoadingPath, true)

  DescribeCluster(clusterName).then(data => {
    const version = data.version
    GetConfiguration(clusterName, (configuration: any) => {
      setState(['app', 'wizard', 'version'], version)
      loadTemplate(load(configuration), () => setState(wizardLoadingPath, false))
    })
  })
}

export {loadTemplate, subnetName, loadTemplateFromCluster}
