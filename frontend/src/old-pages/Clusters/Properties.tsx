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
import {ClusterStatus, ClusterDescription} from '../../types/clusters'
import React from 'react'
import {Trans, useTranslation} from 'react-i18next'
import {findFirst, clusterDefaultUser} from '../../util'
import {useState, setState, ssmPolicy} from '../../store'

// UI Elements
import {
  Box,
  Button,
  ColumnLayout,
  Container,
  Header,
  Link,
  Popover,
  SpaceBetween,
  StatusIndicator,
} from '@cloudscape-design/components'

// Components
import ConfigDialog from './ConfigDialog'
import DateView from '../../components/date/DateView'
import {
  ClusterStatusIndicator,
  ComputeFleetStatusIndicator,
} from '../../components/Status'
import TitleDescriptionHelpPanel from '../../components/help-panel/TitleDescriptionHelpPanel'
import InfoLink from '../../components/InfoLink'
import {useClusterPoll} from '../../components/useClusterPoll'
import {ValueWithLabel} from '../../components/ValueWithLabel'
import {EnableCostMonitoringButton} from './Costs/EnableCostMonitoringButton'

export default function ClusterProperties() {
  const {t} = useTranslation()
  const clusterName = useState(['app', 'clusters', 'selected'])
  const clusterPath = ['clusters', 'index', clusterName]
  const cluster: ClusterDescription = useState(clusterPath)
  const headNode = useState([...clusterPath, 'headNode'])
  const defaultRegion = useState(['aws', 'region'])
  const region = useState(['app', 'selectedRegion']) || defaultRegion

  function isSsmPolicy(p: any) {
    return p.hasOwnProperty('Policy') && p.Policy === ssmPolicy(region)
  }
  const iamPolicies = useState([
    ...clusterPath,
    'config',
    'HeadNode',
    'Iam',
    'AdditionalIamPolicies',
  ])
  const ssmEnabled = iamPolicies && findFirst(iamPolicies, isSsmPolicy)

  const footerLinks = [
    {
      title: t('global.help.ec2ConnectLink.title'),
      href: t('global.help.ec2ConnectLink.href'),
    },
  ]

  useClusterPoll(clusterName, true)

  return (
    <>
      <ConfigDialog />
      <Container
        header={
          <Header actions={<EnableCostMonitoringButton />} variant="h3">
            {t('cluster.properties.title')}
          </Header>
        }
      >
        <ColumnLayout columns={3} variant="text-grid">
          <SpaceBetween size="l">
            {cluster.clusterStatus !== ClusterStatus.CreateFailed && (
              <ValueWithLabel
                label={t('cluster.properties.configurationLabel')}
              >
                <Link
                  href="#"
                  onFollow={() =>
                    setState(
                      ['app', 'clusters', 'clusterConfig', 'dialog'],
                      true,
                    )
                  }
                >
                  {t('cluster.properties.configurationLink')}
                </Link>
              </ValueWithLabel>
            )}
            {headNode && headNode.publicIpAddress && (
              <ValueWithLabel
                label={t('cluster.properties.sshcommand.label')}
                info={
                  <InfoLink
                    helpPanel={
                      <TitleDescriptionHelpPanel
                        title={t('cluster.properties.sshcommand.label')}
                        description={
                          <Trans i18nKey="cluster.properties.sshcommand.tooltiptext">
                            <a
                              rel="noreferrer"
                              target="_blank"
                              href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AccessingInstancesLinux.html#AccessingInstancesLinuxSSHClient"
                            ></a>
                          </Trans>
                        }
                      />
                    }
                  />
                }
              >
                <div className="custom-wrapping">
                  <Box margin={{right: 'xxs'}} display="inline-block">
                    <Popover
                      size="small"
                      position="top"
                      dismissButton={false}
                      triggerType="custom"
                      content={
                        <StatusIndicator type="success">
                          {t('cluster.properties.sshcommand.success')}
                        </StatusIndicator>
                      }
                    >
                      <Button
                        variant="inline-icon"
                        iconName="copy"
                        ariaLabel={t('cluster.properties.sshcommand.help')}
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `ssh ${clusterDefaultUser(cluster)}@${
                              headNode.publicIpAddress
                            }`,
                          )
                        }}
                      >
                        copy
                      </Button>
                    </Popover>
                  </Box>
                  ssh {clusterDefaultUser(cluster)}@{headNode.publicIpAddress}
                </div>
              </ValueWithLabel>
            )}
            {headNode &&
              headNode.publicIpAddress &&
              headNode.publicIpAddress !== '' &&
              ssmEnabled && (
                <ValueWithLabel
                  label={t('cluster.properties.ec2InstanceConnect.label')}
                  info={
                    <InfoLink
                      helpPanel={
                        <TitleDescriptionHelpPanel
                          title={t(
                            'cluster.properties.ec2InstanceConnect.label',
                          )}
                          description={t(
                            'cluster.properties.ec2InstanceConnect.help',
                          )}
                          footerLinks={footerLinks}
                        />
                      }
                    />
                  }
                >
                  <Box margin={{right: 'xxs'}} display="inline-block">
                    <Popover
                      size="small"
                      position="top"
                      dismissButton={false}
                      triggerType="custom"
                      content={
                        <StatusIndicator type="success">
                          {t(
                            'cluster.properties.ec2InstanceConnect.copySuccess',
                          )}{' '}
                        </StatusIndicator>
                      }
                    >
                      <Button
                        variant="inline-icon"
                        iconName="copy"
                        ariaLabel={t(
                          'cluster.properties.ec2InstanceConnect.copyAria',
                        )}
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `mssh -r ${cluster.region} ${clusterDefaultUser(
                              cluster,
                            )}@${headNode.instanceId}`,
                          )
                        }}
                      />
                      {`mssh -r ${cluster.region} ${clusterDefaultUser(
                        cluster,
                      )}@${headNode.instanceId}`}
                    </Popover>
                  </Box>
                </ValueWithLabel>
              )}
          </SpaceBetween>
          <SpaceBetween size="l">
            <ValueWithLabel label={t('cluster.properties.statusLabel')}>
              <ClusterStatusIndicator cluster={cluster} />
            </ValueWithLabel>
            <ValueWithLabel
              label={t('cluster.properties.computeFleetStatusLabel')}
            >
              <ComputeFleetStatusIndicator
                status={cluster.computeFleetStatus}
              />
            </ValueWithLabel>
            <ValueWithLabel label={t('cluster.properties.versionLabel')}>
              {cluster.version}
            </ValueWithLabel>
          </SpaceBetween>
          <SpaceBetween size="l">
            <ValueWithLabel label={t('cluster.properties.regionLabel')}>
              {cluster.region}
            </ValueWithLabel>
            <ValueWithLabel label={t('cluster.properties.creationTimeLabel')}>
              <DateView date={cluster.creationTime} />
            </ValueWithLabel>
            <ValueWithLabel
              label={t('cluster.properties.lastUpdatedTimeLabel')}
            >
              <DateView date={cluster.lastUpdatedTime} />
            </ValueWithLabel>
          </SpaceBetween>
        </ColumnLayout>
      </Container>
    </>
  )
}
