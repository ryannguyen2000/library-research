# -*- coding: utf-8 -*-
from __future__ import print_function

import json

import argparse
import numpy as np
import scipy

import scipy.optimize as optimize
import math as mt

BookingRateByDays = {
    0: 92,
    1: 92,
    2: 59,
    3: 40
}

BookingRateByHours = {
    1: 5,
    2: 3,
    3: 5,
    4: 3,
    5: 2,
    6: 5,
    7: 4,
    8: 8,
    9: 8,
    10: 10,
    11: 8,
    12: 4,
    13: 5,
    14: 3,
    15: 1,
    16: 3,
    17: 4,
    21: 2,
    22: 2,
    23: 4,
    24: 4
}


def getIntegral(d):
    integral = {}
    total = 0.0
    maxKeys = max(d.keys())
    for k in range(0, maxKeys+1):
        integral[k] = total = total + d.get(k, 0.0)

    for k in range(0, maxKeys+1):
        integral[k] = float(integral[k]) / total

    return integral


NominalRateByDays = getIntegral(BookingRateByDays)

NominalRateByHours = getIntegral(BookingRateByHours)

# tỷ lệ đặt phòng của last minutes
# lastMinuteBookingRoomRate = 0.40


def demand_price_elasticity(price, nominal_demand,  nominal_price=1.0, elasticity=-2.0,):
    return nominal_demand * (price / nominal_price) ** (elasticity)


def objective(p_t, nominal_demand, nominal_price=1.0, elasticity=-2.0):
    return -1.0*p_t*demand_price_elasticity(p_t, nominal_demand, nominal_price, elasticity)


def constraint_1(p_t, minimum_price=0):
    return p_t - minimum_price


def constraint_2(p_t, maximum_price=1.0):
    return maximum_price - p_t


def constraint_3(p_t, capacity=20, forecasted_demand=35.0,
                 nominal_price=120.0, elasticity=-2.0):
    return capacity - demand_price_elasticity(p_t, nominal_demand=forecasted_demand,
                                              nominal_price=nominal_price,
                                              elasticity=elasticity)


def lastMinutesPrice(remainTime, capacity,
                     total_nominal_demand=4,
                     trend=1.0,
                     nominal_price=0.7,
                     maximum_promotion=0.4,
                     elasticity=-2):

    total_room_nominal = total_nominal_demand * trend

    if remainTime.get('days'):
        remaiDays = int(remainTime.get('days'))
        nominal_demand = total_room_nominal * NominalRateByDays[remaiDays]
    else:
        remainHours = int(remainTime.get('hours'))
        nominal_demand = total_room_nominal * \
            NominalRateByHours[remainHours] * NominalRateByDays[0]

    # print('nominal_demand', nominal_demand)
    # print('capacity', capacity)

    constraints = (
        {
            'type': 'ineq',
            'fun': lambda x:  constraint_1(x, minimum_price=1.-maximum_promotion)
        },
        {
            'type': 'ineq',
            'fun': lambda x:  constraint_2(x, maximum_price=1.0)
        },
        {
            'type': 'ineq',
            'fun': lambda x: constraint_3(x, capacity=capacity,
                                          forecasted_demand=nominal_demand,
                                          nominal_price=nominal_price,
                                          elasticity=elasticity)
        }
    )

    p_start = [nominal_price]
    opt_results = optimize.minimize(objective, p_start, args=(nominal_demand,
                                                              nominal_price, elasticity),
                                    method='SLSQP',
                                    constraints=constraints)

    return opt_results





def main():
    parser = argparse.ArgumentParser(description='Smart price calculation.')

    parser.add_argument('-d', '--total_nominal_demand', type=int, default=5,
                        help='Total nominal demand.(Default: %(default)s)')
    parser.add_argument('-t', '--trend', type=float, default=1.0,
                        help='Trending of this day. This parameter means has more guests than normal day. (Default %(default)s. Saturday or Sunday is 1.1 or 1.2)')

    parser.add_argument('-n', '--nominal_price', type=float, default=0.7,
                        help='The normal price for "last minutes" event. (Default: %(default)s means the price is %(default)s x standard price)')

    parser.add_argument('-m', '--maximum_promotion', type=float, default=0.5,
                        help='The maxumum promotion value.(Default: %(default)s)')

    parser.add_argument('-e', '--elasticity', type=float, default=-3.6,
                        help='Elasticity.(Default: %(default)s)')

    args = parser.parse_args()

    configuration = vars(args)
    # print(json.dumps(parsed, indent=4, sort_keys=True))
    # print('configuration:', json.dumps(configuration, indent=4), end='\n\n')

    capacities = list(range(1, 9))

    early = []
    late = []
    step = 3
    for hours in range(24, 0, -step):

        # print("capacity/price at [%2d - %2d):" %
        #       (24-hours, 24-hours+step), end=' ')
        prices = [lastMinutesPrice({'hours': hours}, availableRooms, **configuration).x[0]
                  for availableRooms in capacities]
        prices = [round(p,2) for p in prices]
        # print(' '.join('%d/%.2f' % (c, p) for c, p in zip(capacities, prices)))

        t = [24-hours, 24-hours+step]
        v = list(zip(capacities, prices))
        early.append({'hours':t, 'capacity/price':v})

    # print('\n')

    for days in range(1, 4):
        # print('capacity/price of next %d days:' % days, end=' ')

        prices = [lastMinutesPrice({'days': days}, availableRooms, **configuration).x[0]
                  for availableRooms in capacities]
        # print(' '.join('%d/%.2f' % (c, p) for c, p in zip(capacities, prices)))
        prices = [round(p,2) for p in prices]
        v = list(zip(capacities, prices))
        t = days
        late.append({'day':t, 'capacity/price':v})

    print(json.dumps(
        {
            'configuration':configuration,
            'results':{
                'early': early,
                'late': late
            }
        },

        # indent=2
        ))


if __name__ == "__main__":
    main()
