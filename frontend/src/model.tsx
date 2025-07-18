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
import {ClusterInfoSummary} from './types/clusters'
import {clearState, getState, setState, updateState} from './store'
import {generateRandomId} from './util'

// @ts-expect-error TS(7016) FIXME: Could not find a declaration file for module 'js-y... Remove this comment to see the full error message
import {load, dump} from 'js-yaml'

// UI Elements
import {AppConfig} from './app-config/types'
import {getAppConfig} from './app-config'
import {axiosInstance, executeRequest, HTTPMethod} from './http/executeRequest'
import {
  LogEvent,
  LogEventsResponse,
  LogStream,
  LogStreamsResponse,
  LogStreamView,
} from './types/logs'
import axios, {AxiosError} from 'axios'
import {UserIdentity} from './auth/types'
import {ConfigObject, ConfigTag, PCVersion} from './types/base'
import flowRight from 'lodash/flowRight'
import {
  CostMonitoringData,
  CostMonitoringDataResponse,
  CostMonitoringStatus,
  CostMonitoringStatusResponse,
} from './old-pages/Clusters/Costs/costs.types'
import {FlashbarProps} from '@cloudscape-design/components'

// Types
type Callback = (arg?: any) => void
export type NotifyFn = (
  text: any,
  type?: FlashbarProps.MessageDefinition['type'],
  id?: string,
  dismissible?: FlashbarProps.MessageDefinition['dismissible'],
  loading?: FlashbarProps.MessageDefinition['loading'],
) => void

const notify: NotifyFn = (
  text: any,
  type = 'info',
  id?: string,
  dismissible = true,
  loading = false,
) => {
  let messageId = id || generateRandomId()
  let newMessage = {
    type: type,
    content: text,
    id: messageId,
    loading: loading,
    dismissible: dismissible,
    onDismiss: () =>
      updateState(['app', 'messages'], (currentMessages: Array<any>) =>
        currentMessages.filter(message => message.id !== messageId),
      ),
  }

  const updateFn = (currentMessages: Array<any>) => {
    for (let message of currentMessages || [])
      if (message.id === messageId) {
        Object.assign(message, newMessage)
        return currentMessages
      }
    let newMessages = currentMessages || []
    newMessages.push(newMessage)
    return newMessages
  }

  updateState(['app', 'messages'], updateFn)
}

function request(method: HTTPMethod, url: string, body: any = undefined) {
  const appConfig: AppConfig = getState(['app', 'appConfig'])
  const region = getState(['app', 'selectedRegion'])

  url =
    region && !url.includes('region')
      ? url.includes('?')
        ? `${url}&region=${region}`
        : `${url}?region=${region}`
      : url

  return executeRequest(method, url, body, {}, appConfig)
}

const mapAndApplyTags = flowRight([dump, applyProductTags, load])

function CreateCluster(
  clusterName: string,
  clusterConfig: string,
  region: string,
  selectedRegion: string,
  version: string,
  dryrun = false,
  successCallback?: Callback,
  errorCallback?: Callback,
) {
  var url = 'api?path=/v3/clusters'
  url += dryrun ? '&dryrun=true' : ''
  url += region ? `&region=${region}` : ''
  url += version ? `&version=${version}` : ''
  var body = {
    clusterName: clusterName,
    clusterConfiguration: mapAndApplyTags(clusterConfig),
  }
  request('post', url, body)
    .then((response: any) => {
      if (response.status === 202) {
        if (!dryrun && region === selectedRegion) {
          updateState(['clusters', 'index', clusterName], (existing: any) => {
            return {...existing, ...response.data}
          })
        }
        successCallback && successCallback(response.data)
      } else {
        console.log(response)
        notify(`Error (${clusterName}): ${response.data.message}`, 'error')
      }
    })
    .catch((error: any) => {
      if (error.response) {
        errorCallback && errorCallback(error.response.data)
        console.log(error.response.data)
      }
    })
}

const PCUI_TAG_KEY = 'parallelcluster-ui'
function applyProductTags(config: ConfigObject): ConfigObject {
  const tags: ConfigTag[] = config?.Tags ?? []
  const hasProductTags = tags.find(tag => tag.Key === PCUI_TAG_KEY)
  return {
    ...config,
    Tags: hasProductTags
      ? tags
      : [
          ...tags,
          {
            Key: PCUI_TAG_KEY,
            Value: 'true',
          },
        ],
  }
}

function UpdateCluster(
  clusterName: any,
  clusterConfig: any,
  dryrun = false,
  forceUpdate: any,
  version: any,
  successCallback?: Callback,
  errorCallback?: Callback,
) {
  var url = `api?path=/v3/clusters/${clusterName}`
  url += dryrun ? '&dryrun=true' : ''
  url += forceUpdate ? '&forceUpdate=true' : ''
  url += version ? `&version=${version}` : ''
  var body = {clusterConfiguration: clusterConfig}
  request('put', url, body)
    .then((response: any) => {
      if (response.status === 202) {
        if (!dryrun) {
          notify('Successfully Updated: ' + clusterName, 'success')
          updateState(['clusters', 'index', clusterName], (existing: any) => {
            return {...existing, ...response.data}
          })
        }
        successCallback && successCallback(response.data)
      } else {
        console.log(response)
        notify(`Error (${clusterName}): ${response.data.message}`, 'error')
      }
    })
    .catch((error: any) => {
      if (error.response) {
        errorCallback && errorCallback(error.response.data)
        console.log(error.response.data)
      }
    })
}

async function DescribeCluster(clusterName: string, errorCallback?: Callback) {
  var url = `api?path=/v3/clusters/${clusterName}`
  try {
    const response = await request('get', url)
    if (response.status === 200) {
      updateState(['clusters', 'index', clusterName], (existing: any) => {
        return {...existing, ...response.data}
      })
    }
    return response.data || {}
  } catch (error: any) {
    if (error.response) {
      errorCallback && errorCallback()
      notify(`Error (${clusterName}): ${error.response.data.message}`, 'error')
    }
    console.log(error)
    throw error
  }
}

function DeleteCluster(clusterName: any, callback?: Callback) {
  var url = `api?path=/v3/clusters/${clusterName}`
  request('delete', url)
    .then((response: any) => callback && callback(response.data))
    .catch((error: any) => {
      if (error.response)
        notify(
          `Error (${clusterName}): ${error.response.data.message}`,
          'error',
        )
      console.log(error)
    })
}

async function ListClusters(): Promise<ClusterInfoSummary[]> {
  const region = getState(['app', 'selectedRegion'])
  var url = '/pcui/api?path=/v3/clusters'
  url += region ? `&region=${region}` : ''
  try {
    // Using axios.get instead of request to pass in params, which can handle the special characters in the token
    var response = await axios.get(url)
    var clusters = response.data.clusters
    while ('nextToken' in response.data) {
      response = await axios.get(url, {
        params: {
          nextToken: encodeURIComponent(response.data.nextToken),
        },
      })
      clusters = clusters.concat(response.data.clusters)
    }
    setState(['clusters', 'list'], clusters)
    return clusters || []
  } catch (error) {
    if ((error as any).response) {
      notify(`Error: ${(error as any).response.data.message}`, 'error')
    }
    throw error
  }
}

function GetConfiguration(clusterName: any, callback?: Callback) {
  request(
    'get',
    `manager/get_cluster_configuration?cluster_name=${clusterName}`,
  )
    .then((response: any) => {
      console.log('Configuration Success', response)
      if (response.status === 200) {
        callback && callback(response.data)
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(
          `Error (${clusterName}): ${error.response.data.message}`,
          'error',
        )
      console.log(error)
    })
}

function UpdateComputeFleet(clusterName: any, fleetStatus: any) {
  request('patch', `api?path=/v3/clusters/${clusterName}/computefleet`, {
    status: fleetStatus,
  })
    .then((response: any) => {
      //console.log("Configuration Success", response)
      if (response.status === 200) {
        DescribeCluster(clusterName)
        //store.dispatch({type: 'clusters/configuration', payload: response.data})
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(
          `Error (${clusterName}): ${error.response.data.message}`,
          'error',
        )
      console.log(error)
    })
}

function GetClusterInstances(clusterName: any, callback?: Callback) {
  request('get', `api?path=/v3/clusters/${clusterName}/instances`)
    .then((response: any) => {
      //console.log("Instances Success", response)
      if (response.status === 200) {
        callback && callback(response.data)
        setState(
          ['clusters', 'index', clusterName, 'instances'],
          response.data.instances,
        )
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(
          `Error (${clusterName}): ${error.response.data.message}`,
          'error',
        )
      console.log(error)
    })
}

function GetClusterStackEvents(clusterName: any) {
  request('get', `api?path=/v3/clusters/${clusterName}/stackevents`)
    .then((response: any) => {
      //console.log(response)
      if (response.status === 200)
        setState(
          ['clusters', 'index', clusterName, 'stackevents'],
          response.data,
        )
    })
    .catch((error: any) => {
      if (error.response)
        notify(
          `Error (${clusterName}): ${error.response.data.message}`,
          'error',
        )
      console.log(error)
    })
}

function toLogStreamView(rawStream: LogStream): LogStreamView {
  const {logStreamName, lastEventTimestamp} = rawStream
  const [hostname, instanceId, logIdentifier] = logStreamName.split('.')
  return {
    logStreamName,
    hostname,
    instanceId,
    logIdentifier,
    lastEventTimestamp,
    nodeType: null,
  }
}

async function ListClusterLogStreams(
  clusterName: string,
): Promise<LogStreamView[]> {
  var url = `api?path=/v3/clusters/${clusterName}/logstreams`
  try {
    const {data}: {data: LogStreamsResponse} = await request('get', url)
    return data?.logStreams.map(toLogStreamView) || []
  } catch (error) {
    if ((error as AxiosError).response) {
      notify(`Error: ${(error as any).response.data.message}`, 'error')
    }
    throw error
  }
}

async function ListClusterLogEvents(
  clusterName: string,
  logStreamName: string,
): Promise<LogEvent[]> {
  var url = `api?path=/v3/clusters/${clusterName}/logstreams/${logStreamName}`
  try {
    const {data}: {data: LogEventsResponse} = await request('get', url)
    return data?.events || []
  } catch (error) {
    if ((error as AxiosError).response) {
      notify(`Error: ${(error as any).response.data.message}`, 'error')
    }
    throw error
  }
}

function ListCustomImages(
  imageStatus?: string,
  region?: string,
  callback?: Callback,
) {
  imageStatus ||= 'AVAILABLE'
  var url
  if (!region) url = `api?path=/v3/images/custom&imageStatus=${imageStatus}`
  else
    url = `api?path=/v3/images/custom&imageStatus=${imageStatus}&region=${region}`

  request('get', url)
    .then((response: any) => {
      //console.log(response)
      if (response.status === 200) {
        const payload = response.data.images
        if (callback) callback(response.data.images)
        else setState(['customImages', 'list'], payload)
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(
          `Error retrieving images: ${error.response.data.message}`,
          'error',
        )
      console.log(error)
    })
}

function DescribeCustomImage(imageId: any) {
  var url = `api?path=/v3/images/custom/${imageId}`
  request('get', url)
    .then((response: any) => {
      //console.log("Describe Success", response)
      if (response.status === 200) {
        updateState(['customImages', 'index', imageId], (existing: any) => {
          return {...existing, ...response.data}
        })
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(`Error (${imageId}): ${error.response.data.message}`, 'error')
      console.log(error)
    })
}

function GetCustomImageConfiguration(imageId: any, callback?: Callback) {
  request('get', `manager/get_custom_image_configuration?image_id=${imageId}`)
    .then((response: any) => {
      console.log('Configuration Success', response)
      if (response.status === 200) {
        setState(
          ['customImages', 'index', imageId, 'configuration'],
          response.data,
        )
        callback && callback(response.data)
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(`Error (${imageId}): ${error.response.data.message}`, 'error')
      console.log(error)
    })
}

async function BuildImage(imageId: string, imageConfig: string, version: string) {
  var url = 'api?path=/v3/images/custom'
  url += version ? `&version=${version}` : ''
  var body = {imageId: imageId, imageConfiguration: imageConfig}
  const {data} = await request('post', url, body)
  notify(`Successfully queued build for ${imageId}.`, 'success')
  updateState(['customImages', 'index', imageId], (existing: any) => {
    return {...existing, ...data}
  })
  return data
}

async function ListOfficialImages(region?: string, version?: string) {
  const url = `api?path=/v3/images/official${region ? `&region=${region}` : ''}${version ? `&version=${version}` : ''}`
  try {
    const {data} = await request('get', url)
    return data?.images || []
  } catch (error) {
    if ((error as any).response) {
      notify(`Error: ${(error as any).response.data.message}`, 'error')
    }
    throw error
  }
}

function ListUsers() {
  var url = 'manager/list_users'
  request('get', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log('userlist', response.data)
        let user_index = response.data.users.reduce((acc: any, user: any) => {
          acc[user.Username] = user
          return acc
        }, {})
        setState(['users', 'index'], user_index)
      } else {
        console.log(response)
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      console.log(error.response)
    })
}

function CreateUser(user: any, successCallback?: Callback) {
  var url = 'manager/create_user'
  request('post', url, user)
    .then((response: any) => {
      if (response.status === 200) {
        console.log('user added:', response.data)
        let returned_user = response.data
        setState(['users', 'index', returned_user.Username], returned_user)
        return successCallback && successCallback(response.data)
      } else {
        console.log(response)
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      console.log(error.response)
    })
}

function DeleteUser(user: any, successCallback?: Callback) {
  var url = `manager/delete_user?username=${user.Username}`
  request('delete', url)
    .then((response: any) => {
      if (response.status === 200) {
        let returned_user = response.data
        console.log(`user ${returned_user.Username} deleted`)
        return successCallback && successCallback(response.data)
      } else {
        console.log(response)
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      console.log(error.response)
    })
}

function GetCustomImageStackEvents(imageId: any) {
  request('get', `api?path=/v3/images/custom/${imageId}/stackevents`)
    .then((response: any) => {
      console.log(response)
      if (response.status === 200) {
        setState(
          ['customImages', 'index', imageId, 'stackevents'],
          response.data,
        )
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(`Error: ${imageId} -- ${error.response.data.message}`, 'error')
      console.log(error)
    })
}

function ListCustomImageLogStreams(imageId: any) {
  request('get', `api?path=/v3/images/custom/${imageId}/logstreams`)
    .then((response: any) => {
      if (response.status === 200) {
        setState(
          ['customImages', 'index', imageId, 'logstreams'],
          response.data,
        )
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(`Error (${imageId}): ${error.response.data.message}`, 'error')
      console.log(error)
    })
}

function GetCustomImageLogEvents(imageId: any, logStreamName: any) {
  request(
    'get',
    `api?path=/v3/images/custom/${imageId}/logstreams/${encodeURIComponent(
      logStreamName,
    )}`,
  )
    .then((response: any) => {
      //console.log(response)
      if (response.status === 200) {
        setState(
          ['customImages', 'index', imageId, 'logEventIndex', logStreamName],
          response.data,
        )
      }
    })
    .catch((error: any) => {
      if (error.response)
        notify(
          `Error (${imageId}/${logStreamName}): ${error.response.data.message}`,
          'error',
        )
      console.log(error)
    })
}

function GetInstanceTypes(region?: string, callback?: Callback) {
  var url
  if (!region) {
    url = `manager/get_instance_types`
  } else {
    url = `manager/get_instance_types?region=${region}`
  }

  request('get', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log(response.data)
        setState(['aws', 'instanceTypes'], response.data.instance_types)
      }
      callback && callback(response.data)
    })
    .catch((error: any) => {
      if (error.response) {
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

function LoadAwsConfig(region?: string, callback?: Callback) {
  var url

  ListCustomImages('AVAILABLE', region, (images: any) =>
    setState(['app', 'wizard', 'customImages'], images),
  )
  ListOfficialImages(region).then(images =>
    setState(['app', 'wizard', 'officialImages'], images),
  )

  if (!region) {
    url = `manager/get_aws_configuration`
  } else {
    url = `manager/get_aws_configuration?region=${region}`
  }

  request('get', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log('aws', response.data)
        const {fsx_filesystems, fsx_volumes, file_caches, ...data} =
          response.data
        setState(['aws'], {
          fsxFilesystems: extractFsxFilesystems(fsx_filesystems),
          fsxVolumes: extractFsxVolumes(fsx_volumes),
          fileCaches: extractFileCaches(file_caches),
          ...data,
        })
        GetInstanceTypes(region)
      }
      callback && callback(response.data)
    })
    .catch((error: any) => {
      if (error.response) {
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

const extractFsxFilesystems = (filesystems: any) => {
  const mappedFilesystems = filesystems
    .map((fs: any) => ({
      id: fs.FileSystemId,
      name: nameFromFilesystem(fs),
      type: fs.FileSystemType,
    }))
    .map((fs: any) => ({
      ...fs,
      displayName: `${fs.id} ${fs.name}`,
    }))

  return {
    lustre: mappedFilesystems.filter((fs: any) => fs.type === 'LUSTRE'),
    zfs: mappedFilesystems.filter((fs: any) => fs.type === 'OPENZFS'),
    ontap: mappedFilesystems.filter((fs: any) => fs.type === 'ONTAP'),
  }
}

const extractFileCaches = (file_caches: any) => {
  const mappedFileCaches = file_caches
    .map((fc: any) => ({
      id: fc.FileCacheId,
      name: nameFromFilesystem(fc),
      type: fc.FileCacheType,
    }))
    .map((fc: any) => ({
      ...fc,
      displayName: `${fc.id} ${fc.name}`,
    }))

  return {
    lustre: mappedFileCaches.filter((fc: any) => fc.type === 'LUSTRE'),
  }
}

const nameFromFilesystem = (filesystem: any) => {
  const {Tags: tags} = filesystem
  if (!tags) {
    return ''
  }
  const nameTag = filesystem.Tags.find((tag: any) => tag.Key === 'Name')
  return nameTag ? nameTag.Value : ''
}

const extractFsxVolumes = (volumes: any) => {
  const mappedVolumes = volumes
    .map((vol: any) => ({
      id: vol.VolumeId,
      name: vol.Name,
      type: vol.VolumeType,
    }))
    .map((vol: any) => ({
      ...vol,
      displayName: `${vol.id} ${vol.name}`,
    }))

  return {
    zfs: mappedVolumes.filter((vol: any) => vol.type === 'OPENZFS'),
    ontap: mappedVolumes.filter((vol: any) => vol.type === 'ONTAP'),
  }
}

async function GetVersion(): Promise<PCVersion> {
  var url = `manager/get_version`
  try {
    const {data} = await request('get', url)
    const versionObject = {
      full: data.version,
    }
    setState(['app', 'version'], versionObject)
    return versionObject
  } catch (error) {
    if ((error as AxiosError).response) {
      notify(`Error: ${(error as any).response.data.message}`, 'error')
    }
    throw error
  }
}

function Ec2Action(instanceId: any, action: any, callback?: Callback) {
  let url = `manager/ec2_action?instance_id=${instanceId}&action=${action}`

  request('post', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log('ec2_action', response.data)
      }
      callback && callback(response.data)
    })
    .catch((error: any) => {
      if (error.response) {
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

function GetDcvSession(instanceId: any, user: any, callback?: Callback) {
  const region =
    getState(['app', 'selectedRegion']) || getState(['aws', 'region'])
  let url = `manager/get_dcv_session?instance_id=${instanceId}&user=${
    user || 'ec2-user'
  }&region=${region}`
  request('get', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log(response.data)
        callback && callback(response.data)
      }
    })
    .catch((error: any) => {
      if (error.response) {
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

// Queue Operations
function QueueStatus(
  clusterName: any,
  instanceId: any,
  user: any,
  successCallback?: Callback,
) {
  const region =
    getState(['app', 'selectedRegion']) || getState(['aws', 'region'])
  let url = `manager/queue_status?instance_id=${instanceId}&user=${
    user || 'ec2-user'
  }&region=${region}`
  request('get', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log(response.data)
        setState(['clusters', 'index', clusterName, 'jobs'], response.data.jobs)
        successCallback && successCallback(response.data)
      }
    })
    .catch((error: any) => {
      if (error.response) {
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

function CancelJob(
  instanceId: any,
  user: any,
  jobId: any,
  callback?: Callback,
) {
  const region =
    getState(['app', 'selectedRegion']) || getState(['aws', 'region'])
  let url = `manager/cancel_job?instance_id=${instanceId}&user=${
    user || 'ec2-user'
  }&region=${region}&job_id=${jobId}`
  request('get', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log(response.data)
        callback && callback(response.data)
      }
    })
    .catch((error: any) => {
      if (error.response) {
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

function JobInfo(
  instanceId: any,
  user: any,
  jobId: any,
  successCallback?: Callback,
  failureCallback?: Callback,
) {
  const region =
    getState(['app', 'selectedRegion']) || getState(['aws', 'region'])
  let url = `manager/scontrol_job?instance_id=${instanceId}&user=${
    user || 'ec2-user'
  }&region=${region}&job_id=${jobId}`
  request('get', url)
    .then((response: any) => {
      if (response.status === 200) {
        console.log(response.data)
        successCallback && successCallback(response.data)
      }
    })
    .catch((error: any) => {
      console.log('jif', error)
      if (error.response) {
        failureCallback && failureCallback(error.response)
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

function SlurmAccounting(
  clusterName: any,
  instanceId: any,
  user: any,
  args: any,
  successCallback?: Callback,
  failureCallback?: Callback,
) {
  const region =
    getState(['app', 'selectedRegion']) || getState(['aws', 'region'])
  let url = `manager/sacct?instance_id=${instanceId}&cluster_name=${clusterName}&user=${
    user || 'ec2-user'
  }&region=${region}`
  request('post', url, args)
    .then((response: any) => {
      if (response.status === 200) {
        console.log("Accounting data retrieved", response.data)
        successCallback && successCallback(response.data)
      }
    })
    .catch((error: any) => {
      if (error.response) {
        failureCallback && failureCallback(error.response)
        console.log(error.response)
        notify(`Error: ${error.response.data.message}`, 'error')
      }
      console.log(error)
    })
}

async function GetIdentity(): Promise<UserIdentity | undefined> {
  const response = await request('get', 'manager/get_identity')
  if (response.status === 200) {
    setState(['identity'], response.data)
    return response.data
  }
}

async function GetAppConfig() {
  try {
    const appConfig = await getAppConfig(axiosInstance)
    setState(['app', 'appConfig'], appConfig)
    return appConfig
  } catch (error) {
    if ((error as any).response) {
      notify(`Error: ${(error as any).response.data.message}`, 'error')
    }
    throw error
  }
}

async function GetCostMonitoringStatus(): Promise<CostMonitoringStatus> {
  var url = `cost-monitoring`
  try {
    const {data}: {data: CostMonitoringStatusResponse} = await request(
      'get',
      url,
    )
    return data?.active || false
  } catch (error) {
    if ((error as AxiosError).response) {
      console.log(`Error: ${(error as any).response.data.message}`)
    }
    throw error
  }
}

async function ActivateCostMonitoring() {
  var url = `cost-monitoring`

  return request('put', url)
}

async function GetCostMonitoringData(
  clusterName: string,
  fromDate: string,
  toDate: string,
): Promise<CostMonitoringData[]> {
  var url = `cost-monitoring/clusters/${clusterName}?start=${fromDate}&end=${toDate}`
  const {data}: {data: CostMonitoringDataResponse} = await request('get', url)
  return data?.costs || []
}

async function LoadInitialState() {
  const region = getState(['app', 'selectedRegion'])
  clearState(['app', 'aws'])
  ListUsers()
  ListClusters()
  ListCustomImages()
  ListOfficialImages()
  LoadAwsConfig(region)
}

export {
  CreateCluster,
  UpdateCluster,
  ListClusters,
  DescribeCluster,
  GetConfiguration,
  DeleteCluster,
  UpdateComputeFleet,
  GetClusterInstances,
  GetClusterStackEvents,
  ListClusterLogStreams,
  ListClusterLogEvents,
  ListCustomImages,
  DescribeCustomImage,
  GetCustomImageConfiguration,
  BuildImage,
  GetCustomImageStackEvents,
  ListCustomImageLogStreams,
  GetCustomImageLogEvents,
  ListOfficialImages,
  LoadInitialState,
  Ec2Action,
  LoadAwsConfig,
  GetDcvSession,
  QueueStatus,
  CancelJob,
  SlurmAccounting,
  JobInfo,
  ListUsers,
  notify,
  CreateUser,
  DeleteUser,
  GetIdentity,
  GetAppConfig,
  GetVersion,
  GetCostMonitoringStatus,
  ActivateCostMonitoring,
  GetCostMonitoringData,
}
