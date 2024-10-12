# -*- coding: utf-8 -*-
from __future__ import print_function

import json

import argparse
import numpy as np
import scipy

import scipy.optimize as optimize
import math as mt
from configuration import *
import warnings
warnings.filterwarnings("ignore")


def integral(zeroDaysBeforeRate, oneDaysBeforeRate, twoDaysBeforeRate, threeDaysBeforeRate):
    v = 0
    ret = []
    for time, rate in reversed(zeroDaysBeforeRate):
        v = v + rate
        ret.append([time, v])

    zeroDaysBeforeRate = list(reversed(ret))
    
    oneDaysBeforeRate = oneDaysBeforeRate + v
    twoDaysBeforeRate = twoDaysBeforeRate + oneDaysBeforeRate
    threeDaysBeforeRate = threeDaysBeforeRate + twoDaysBeforeRate

    durations = {
        0: zeroDaysBeforeRate,
        1: oneDaysBeforeRate,
        2: twoDaysBeforeRate,
        3: threeDaysBeforeRate
    }

    return durations





def demand_price_elasticity(price, nominal_demand,  nominal_price=1.0, elasticity=-2.0,):
    return nominal_demand * (price / nominal_price) ** (elasticity)


def objective(p_t, nominal_demand, nominal_price=1.0, elasticity=-2.0):
    return -1.0 * p_t * demand_price_elasticity(p_t, nominal_demand, nominal_price, elasticity)


def constraint_1(p_t, minimum_price=0):
    return p_t - minimum_price


def constraint_2(p_t, maximum_price=1.0):
    return maximum_price - p_t


def constraint_3(p_t, capacity=20, forecasted_demand=35.0,
                 nominal_price=120.0, elasticity=-2.0):
    return capacity - demand_price_elasticity(p_t, nominal_demand=forecasted_demand,
                                              nominal_price=nominal_price,
                                              elasticity=elasticity)


def lastMinutesPrice(durationRates, remainTime, capacity,
                     total_room=4,
                     trend=1.0,
                     nominal_price=0.1,
                     maximum_promotion=0.4,
                     elasticity=-2):

    if remainTime.get('days'):
        remaiDays = int(remainTime.get('days'))
        nominal_demand = total_room * durationRates[remaiDays]
    else:
        remainHours = int(remainTime.get('hours'))
        for [t1, t2], rate in durationRates[0]:
            if t1 <= remainHours and remainHours < t2:
                nominal_demand = total_room*rate
                break
        else:
            nominal_demand = total_room*rate

    nominal_demand = nominal_demand*trend


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

    parser.add_argument('-r', '--rooms', type=int, default=30,
                        help='number of rooms.')
    parser.add_argument('-t', '--trend', type=float, default=1.0,
                        help='Trending of this day. This parameter means has more guests than normal day. (Default %(default)s. Saturday or Sunday is 1.1 or 1.2)')

    parser.add_argument('-mi', '--minimum_promotion', type=float, default=0.0,
                        help='The minimum promotion value.(Default: %(default)s)')

    parser.add_argument('-m', '--maximum_promotion', type=float, default=0.5,
                        help='The maxumum promotion value.(Default: %(default)s)')

    parser.add_argument('-e', '--elasticity', type=float, default=-3.6,
                        help='Elasticity.(Default: %(default)s)')

    args = vars(parser.parse_args())


    durationRates = integral(
        zeroDaysBeforeRate, oneDaysBeforeRate, twoDaysBeforeRate, threeDaysBeforeRate)
    capacities = list(range(1, totalRooms+1))

    configuration = {
        'total_room': args['rooms'],
        'trend': args['trend'],
        'nominal_price': 1.0 - args['minimum_promotion'],
        'maximum_promotion': args['maximum_promotion'],
        'elasticity': args['elasticity']
    }

    step = 3
    early = []
    late = []
    for [hours,_],_ in durationRates[0]:

        # print("capacity/price at [%2d - %2d):" %
        #       (hours, hours+step), end=' ')
        prices = [lastMinutesPrice(durationRates, {'hours': hours+1}, availableRooms, **configuration).x[0]
                  for availableRooms in capacities]
        prices = [round(p, 2) for p in prices]
        # print(' '.join('%d/%.2f' % (c, p) for c, p in zip(capacities, prices)))

        t = [hours, hours+step]
        v = list(zip(capacities, prices))
        early.append({'hours': t, 'capacity/price': v})

    for days in range(1, 4):
        # print('capacity/price next %d days:' % days, end=' ')

        prices = [lastMinutesPrice(durationRates, {'days': days}, availableRooms, **configuration).x[0]
                  for availableRooms in capacities]
        # print(' '.join('%d/%.2f' % (c, p) for c, p in zip(capacities, prices)))
        prices = [round(p, 2) for p in prices]
        v = list(zip(capacities, prices))
        t = days
        late.append({'day': t, 'capacity/price': v})

    print(json.dumps(
        {
            'configuration': configuration,
            'results': {
                'early': early,
                'late': late
            }
        },

        indent=2
    ))

if __name__ == '__main__':
    main()
