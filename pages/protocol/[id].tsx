import { useState, useRef, useEffect } from 'react';
import { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import addDays from 'date-fns/addDays';
import subDays from 'date-fns/subDays';
import isAfter from 'date-fns/isAfter';
import { ArrowLeft } from 'react-feather';
import Attribute from 'components/Attribute';
import Chart from 'components/Chart';
import ChartToolbar from 'components/ChartToolbar';
import SocialTags from 'components/SocialTags';
import { getIDs, getMetadata } from 'data/adapters';
import { getDateRangeData, getMarketData } from 'data/queries';
import { formatDate } from 'data/lib/time';
import icons from 'components/icons';

const GITHUB_URL = 'https://github.com/dmihal/crypto-fees/blob/master/data/adapters/';

function getMissing(data: any, minDate: Date, maxDate: Date, id: string) {
  const missing = [];
  if (!data[id]) {
    data[id] = {};
  }

  for (let date = minDate; !isAfter(date, maxDate); date = addDays(date, 1)) {
    const dateStr = formatDate(date);
    if (!data[id][dateStr]) {
      missing.push(dateStr);
    }
  }
  return missing;
}

function getDateWithSmoothing(data: any, id: string, date: Date, smoothing: number) {
  let fee = data[id][formatDate(date)].fee;

  if (smoothing > 0) {
    for (let i = 1; i <= smoothing; i += 1) {
      fee += data[id][formatDate(subDays(date, i))].fee;
    }
    fee /= smoothing + 1;
  }

  return fee;
}

function formatData(
  data: any,
  minDate: Date,
  maxDate: Date,
  primaryId: string,
  secondaryId: string | null,
  smoothing: number
) {
  const result = [];
  for (let date = minDate; !isAfter(date, maxDate); date = addDays(date, 1)) {
    const primary = getDateWithSmoothing(data, primaryId, date, smoothing);
    const secondary = secondaryId ? getDateWithSmoothing(data, secondaryId, date, smoothing) : 0;

    result.push({
      date: date.getTime() / 1000,
      primary,
      secondary,
    });
  }
  return result;
}

function saveFeeData(response: any, storedFees: any) {
  for (const protocol of response) {
    if (!storedFees[protocol.id]) {
      storedFees[protocol.id] = {};
    }

    for (const { date, ...data } of protocol.data) {
      storedFees[protocol.id][date] = data;
    }
  }
}

const emptyData = ({ start, end }: { start: Date; end: Date }) => {
  const data = [];
  for (let date = start; !isAfter(date, end); date = addDays(date, 1)) {
    data.push({ date: date.getTime() / 1000, primary: null, secondary: null });
  }
  return data;
};

const useFees = (
  initial: any,
  dateRange: { start: Date; end: Date },
  primary: string,
  secondary: string | null,
  smoothing: number
) => {
  const fees = useRef(initial);

  const [value, setValue] = useState({
    loading: false,
    data: emptyData(dateRange),
  });

  useEffect(() => {
    // We need to fetch extra data if using smoothing
    const actualStartDate = smoothing > 0 ? subDays(dateRange.start, smoothing) : dateRange.start;

    const missingPrimary = getMissing(fees.current, actualStartDate, dateRange.end, primary);
    const missingSecondary = secondary
      ? getMissing(fees.current, actualStartDate, dateRange.end, secondary)
      : [];

    if (missingPrimary.length > 0 || missingSecondary.length > 0) {
      setValue(({ data }) => ({ data, loading: true }));

      const secondaryQuery =
        missingSecondary.length > 0 ? `&${secondary}=${missingSecondary.join(',')}` : '';
      fetch(`/api/v1/feesByDay?${primary}=${missingPrimary.join(',')}&${secondaryQuery}`)
        .then((response: any) => response.json())
        .then((response: any) => {
          if (!response.success) {
            console.error(response);
            setValue(({ data }) => ({ data, loading: false }));
            return;
          }

          saveFeeData(response.data, fees.current);

          setValue({
            loading: false,
            data: formatData(
              fees.current,
              dateRange.start,
              dateRange.end,
              primary,
              secondary,
              smoothing
            ),
          });
        });
    } else {
      setValue({
        loading: false,
        data: formatData(
          fees.current,
          dateRange.start,
          dateRange.end,
          primary,
          secondary,
          smoothing
        ),
      });
    }
  }, [dateRange, primary, secondary, smoothing]);

  return value;
};

interface ProtocolDetailsProps {
  id: string;
  metadata: any;
  feeCache: any;
  protocols: { [id: string]: string };
  marketData: { marketCap?: number; price?: number; psRatio?: number };
}

const dateFloor = (date: Date) => {
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

export const ProtocolDetails: NextPage<ProtocolDetailsProps> = ({
  id,
  metadata,
  feeCache,
  protocols,
  marketData,
}) => {
  const router = useRouter();
  const [dateRange, setDateRange] = useState({
    start: dateFloor(subDays(new Date(), 90)),
    end: dateFloor(subDays(new Date(), 1)),
  });
  const [smoothing, setSmoothing] = useState(0);
  const [secondary, setSecondary] = useState<string | null>(null);

  const { loading, data } = useFees(feeCache, dateRange, id, secondary, smoothing);

  const { [id]: filter, ...otherProtocols } = protocols; // eslint-disable-line @typescript-eslint/no-unused-vars

  useEffect(() => {
    const { compare, smooth, range } = router.query;
    if (compare || smooth || range) {
      if (compare) {
        setSecondary(compare.toString());
      }
      if (smooth) {
        setSmoothing(parseInt(smooth.toString()) - 1);
      }
      if (range) {
        const [start, end] = range
          .toString()
          .split(',')
          .map((day: string) => new Date(day));
        setDateRange({ start, end });
      }
      router.replace(router.pathname.replace('[id]', id));
    }
  }, [router.query]);

  const icon = metadata.icon || icons[id];

  return (
    <main>
      <Head>
        <title key="title">{metadata.name} - CryptoFees.info</title>
      </Head>

      <SocialTags title={metadata.name} image={id} />

      <h1 className="title">CryptoFees.info</h1>
      <div>
        <Link href="/">
          <a>
            <ArrowLeft size={14} /> Back to list
          </a>
        </Link>
      </div>

      <h2 className="subtitle">
        <div className="icon" style={{ backgroundImage: `url('${icon}')` }} />
        {metadata.name}
      </h2>

      {metadata.legacy && <div className="legacy">Some historical data may be unavailable</div>}

      <ChartToolbar
        range={dateRange}
        onRangeChange={setDateRange}
        maxDate={subDays(new Date(), 1)}
        smoothing={smoothing}
        onSmoothingChange={setSmoothing}
        protocols={otherProtocols}
        secondary={secondary}
        onSecondaryChange={setSecondary}
      />

      <div className="chart-container">
        <Chart
          data={data}
          loading={loading}
          primary={id}
          secondary={secondary}
          protocols={protocols}
        />
      </div>

      <p>{metadata.description}</p>

      {metadata.feeDescription && (
        <Attribute title="Fee Model">{metadata.feeDescription}</Attribute>
      )}

      <div className="row">
        {metadata.website && (
          <Attribute title="Website">
            <a href={metadata.website} target="website">
              {metadata.website.replace('https://', '')}
            </a>
          </Attribute>
        )}
        {metadata.blockchain && <Attribute title="Blockchain">{metadata.blockchain}</Attribute>}
        {metadata.source && (
          <Attribute title="Source">
            {metadata.adapter ? (
              <a href={`${GITHUB_URL}${metadata.adapter}.ts`} target="source">
                {metadata.source}
              </a>
            ) : (
              metadata.source
            )}
          </Attribute>
        )}
      </div>

      {metadata.tokenTicker && (
        <div className="row">
          <Attribute title="Token">
            <a
              href={`https://www.coingecko.com/en/coins/${metadata.tokenCoingecko}`}
              target="coingecko"
            >
              {metadata.tokenTicker}
            </a>
          </Attribute>

          <Attribute title="Price">
            {marketData.price?.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
            })}
          </Attribute>
          <Attribute title="Market Cap">
            {marketData.marketCap?.toLocaleString('en-US', {
              style: 'currency',
              currency: 'USD',
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </Attribute>
          <Attribute title="P/S Ratio" tooltip="Based on 7 day average fees, annualized">
            {marketData.psRatio?.toFixed(2)}
          </Attribute>
        </div>
      )}

      <style jsx>{`
        main {
          margin-bottom: 18px;
        }
        .title {
          margin: 10px 0 4px;
        }
        .chart-container {
          padding: 14px;
          background: #ffffff;
          border-radius: 8px;
          margin: 6px 0;
          border: solid 1px #d0d1d9;
        }
        .row {
          display: flex;
        }
        .row > :global(div) {
          flex: 1;
        }
        h2 {
          display: flex;
          align-items: center;
        }
        .icon {
          height: 24px;
          width: 24px;
          background-repeat: no-repeat;
          background-position: center;
          background-size: contain;
          margin-right: 8px;
        }
        .legacy {
          font-size: 12px;
          color: #666;
          margin: 4px 0;
          padding: 6px;
          background: #f3e8d4;
          border-radius: 4px;
        }
      `}</style>
    </main>
  );
};

export default ProtocolDetails;

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const id = params.id.toString();
  const defaultFeesArray = await getDateRangeData(
    id,
    subDays(new Date(), 90),
    subDays(new Date(), 1)
  );
  const defaultFees: { [date: string]: any } = {};
  for (const { date, ...data } of defaultFeesArray) {
    defaultFees[date] = data;
  }

  const ids = getIDs().sort();
  const protocols: { [id: string]: string } = {};
  for (const id of ids) {
    protocols[id] = getMetadata(id).name;
  }

  const sevenDayMA =
    defaultFeesArray.slice(-7).reduce((acc: number, day: any) => acc + day.fee, 0) / 7;
  const marketData = await getMarketData(id, sevenDayMA, formatDate(subDays(new Date(), 1)));

  return {
    props: {
      id,
      metadata: getMetadata(id),
      feeCache: {
        [id]: defaultFees,
      },
      protocols,
      marketData,
    },
    revalidate: 60,
  };
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: getIDs().map((id: string) => ({ params: { id } })),
    fallback: false,
  };
};
