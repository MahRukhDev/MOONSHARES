import { useTranslation } from '@pancakeswap/localization'
import { Flex, FlexGap, FlexProps, Text } from '@pancakeswap/uikit'
import { formatBigIntToFixed } from '@pancakeswap/utils/formatBalance'
import { LineChartLoader } from 'components/ChartLoaders'
import PairPriceDisplay from 'components/PairPriceDisplay'
import { chainlinkOracleABI } from 'config/abi/chainlinkOracle'
import { useActiveChainId } from 'hooks/useActiveChainId'
import { useChainlinkOracleContract } from 'hooks/useContract'
import useTheme from 'hooks/useTheme'
import { useCallback, useMemo } from 'react'
import { Area, AreaChart, Dot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useGetRoundsByCloseOracleId, useGetSortedRounds } from 'state/predictions/hooks'
import { NodeRound } from 'state/types'
import styled from 'styled-components'
import { useSWRConfig } from 'swr'
import useSWRImmutable from 'swr/immutable'
import { useContractRead, useContractReads } from 'wagmi'
import { useConfig } from '../context/ConfigProvider'
import { CHART_DOT_CLICK_EVENT } from '../helpers'
import usePollOraclePrice from '../hooks/usePollOraclePrice'
import useSwiper from '../hooks/useSwiper'

function useChainlinkLatestRound() {
  const { chainlinkOracleAddress } = useConfig()
  const chainlinkOracleContract = useChainlinkOracleContract(chainlinkOracleAddress)
  return useContractRead({
    abi: chainlinkOracleContract.abi,
    address: chainlinkOracleContract.address,
    functionName: 'latestRound',
    enabled: !!chainlinkOracleContract,
    watch: true,
  })
}

function useChainlinkRoundDataSet() {
  const { chainId } = useActiveChainId()
  const lastRound = useChainlinkLatestRound()
  const { chainlinkOracleAddress } = useConfig()

  const { data, error } = useContractReads({
    contracts: Array.from({ length: 50 }).map(
      (_, i) =>
        ({
          chainId,
          abi: chainlinkOracleABI,
          address: chainlinkOracleAddress,
          functionName: 'getRoundData',
          args: [(lastRound.data ?? 0n) - BigInt(i)] as const,
        } as const),
    ),
    enabled: !!lastRound.data,
    keepPreviousData: true,
  })

  const computedData: ChartData[] = useMemo(() => {
    return (
      data
        ?.filter((d) => !!d && d.status === 'success' && d.result[1] > 0n)
        .map(({ result }) => {
          const [roundId, answer, startedAt] = result
          return {
            answer: formatBigIntToFixed(answer, 4, 8),
            roundId: roundId.toString(),
            startedAt: Number(startedAt),
          }
        }) ?? []
    )
  }, [data])

  return { data: computedData, error }
}

type ChartData = {
  answer: string
  roundId: string
  startedAt: number
}

function useChartHover() {
  const { data } = useSWRImmutable<ChartData>('chainlinkChartHover')
  return data
}

function useChartHoverMutate() {
  const { mutate } = useSWRConfig()

  const updateHover = useCallback(
    (data) => {
      mutate('chainlinkChartHover', data)
    },
    [mutate],
  )

  return updateHover
}

const chartColor = { gradient1: '#00E7B0', gradient2: '#0C8B6C', stroke: '#31D0AA' }

const ChainlinkChartWrapper = styled(Flex)<{ isMobile?: boolean }>`
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: ${({ theme, isMobile }) => (isMobile ? theme.card.background : theme.colors.gradientBubblegum)};
`

const HoverData = ({ rounds }: { rounds: { [key: string]: NodeRound } }) => {
  const hoverData = useChartHover()
  const { price: answerAsBigNumber } = usePollOraclePrice()
  const {
    t,
    currentLanguage: { locale },
  } = useTranslation()
  const { token } = useConfig()

  return (
    <PairPriceDisplay
      width="100%"
      value={hoverData ? hoverData.answer : formatBigIntToFixed(answerAsBigNumber, 4, 8)}
      inputSymbol={token.symbol}
      outputSymbol="USD"
      format={false}
      flexWrap="wrap"
      alignItems="center"
      columnGap="12px"
    >
      {hoverData && (
        <FlexGap minWidth="51%" alignItems="flex-end" gap="12px" height="22px">
          <Text color="textSubtle" lineHeight={1.1}>
            {new Date(hoverData.startedAt * 1000).toLocaleString(locale, {
              year: 'numeric',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          {rounds[hoverData.roundId] && (
            <Text fontSize="20px" color="secondary" bold lineHeight={1.1}>
              {t('Round')}: #{rounds[hoverData.roundId].epoch}
            </Text>
          )}
        </FlexGap>
      )}
    </PairPriceDisplay>
  )
}

const ChainLinkChart = (props: FlexProps & { isMobile?: boolean }) => {
  const { data } = useChainlinkRoundDataSet()
  const rounds = useGetRoundsByCloseOracleId()

  if (!data.length) {
    return <LineChartLoader />
  }

  return (
    <ChainlinkChartWrapper {...props}>
      <FlexGap
        flexDirection="row"
        pt="12px"
        px="20px"
        alignItems="center"
        flexWrap="wrap"
        columnGap="12px"
        height={['56px', , , , '44px']}
      >
        <HoverData rounds={rounds} />
      </FlexGap>
      <Flex height={[`calc(100% - 56px)`]}>
        <Chart rounds={rounds} data={data} />
      </Flex>
    </ChainlinkChartWrapper>
  )
}

/**
 * Note: remember that it needs to be mounted inside the container with fixed height
 */
const Chart = ({
  rounds,
  data,
}: {
  rounds: {
    [key: string]: NodeRound
  }
  data: ChartData[]
}) => {
  const {
    currentLanguage: { locale },
  } = useTranslation()
  const { isDark, theme } = useTheme()
  const mutate = useChartHoverMutate()

  return (
    <ResponsiveContainer>
      <AreaChart
        data={data}
        margin={{
          top: 20,
          right: 0,
          left: 0,
          bottom: 5,
        }}
        onMouseLeave={() => {
          mutate(undefined)
        }}
      >
        <defs>
          <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={chartColor.gradient1} stopOpacity={0.34} />
            <stop offset="100%" stopColor={chartColor.gradient2} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="startedAt"
          tickFormatter={(time) => {
            return new Date(time * 1000).toLocaleString(locale, {
              hour: 'numeric',
              minute: '2-digit',
              hourCycle: 'h24',
            })
          }}
          color={theme.colors.text}
          fontSize="12px"
          minTickGap={8}
          reversed
          tick={{ fill: theme.colors.text }}
        />
        <XAxis dataKey="roundId" hide />
        <YAxis
          dataKey="answer"
          tickCount={6}
          scale="linear"
          color={theme.colors.textSubtle}
          fontSize="12px"
          domain={['auto', 'auto']}
          orientation="right"
          tick={{ dx: 10, fill: theme.colors.textSubtle }}
        />
        <Tooltip
          cursor={{ stroke: theme.colors.textSubtle, strokeDasharray: '3 3' }}
          contentStyle={{ display: 'none' }}
          formatter={(tooltipValue, name, props) => {
            mutate(props.payload)
            return null
          }}
        />
        <Area
          dataKey="answer"
          type="linear"
          stroke={chartColor.stroke}
          fill="url(#gradient)"
          strokeWidth={2}
          activeDot={(props) => {
            if (rounds[props.payload.roundId]) {
              return <ActiveDot {...props} />
            }
            return null
          }}
          dot={(props) => {
            if (rounds[props.payload.roundId]) {
              return (
                <Dot
                  {...props}
                  r={4}
                  fill={isDark ? theme.colors.gold : theme.colors.secondary}
                  fillOpacity={1}
                  strokeWidth={0}
                />
              )
            }
            return null
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

const ActiveDot = (props) => {
  const { swiper } = useSwiper()
  const sortedRounds = useGetSortedRounds()
  const { theme } = useTheme()

  return (
    <Dot
      {...props}
      r={12}
      stroke={theme.colors.primary}
      strokeWidth={10}
      fill={theme.colors.background}
      style={{ cursor: 'pointer' }}
      onClick={() => {
        const roundIndex = sortedRounds.findIndex((round) => round.closeOracleId === props.payload.roundId)
        if (roundIndex >= 0 && swiper) {
          swiper.slideTo(roundIndex)
          swiper.el.dispatchEvent(new Event(CHART_DOT_CLICK_EVENT))
        }
      }}
    />
  )
}

export default ChainLinkChart
