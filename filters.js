var time_interval = 5000;
var scale_dist = 6371 * 1000 * 2 * Math.PI / 360.0;
var cache_length = 500;
var ori_cache = [];
var mot_cache = [];
var geo_cache = [];
var gacc_z = [];
var filter_post_status = "";
var filter_post_num = 0;
var configs = require("./config.json");

ori_filter = function(ori) {
    ori_cache.push(ori);
    ori_cache.splice(0, ori_cache.length - cache_length);
    return true;
}
mot_filter = function(mot) {
    //todo: rotate gacc_xyz       
    //console.log(mot.time)
    if (ori_cache.length > 0) {

        // var rotation_matrix = R_Matrix(ori_cache[ori_cache.length - 1].beta * Math.PI / 180.0,
        //     ori_cache[ori_cache.length - 1].gamma * Math.PI / 180.0,
        //     ori_cache[ori_cache.length - 1].alpha * Math.PI / 180.0);
        var rotation_matrix = R_Matrix(ori_cache[ori_cache.length - 1].roll * Math.PI / 180.0,
            ori_cache[ori_cache.length - 1].pitch * Math.PI / 180.0,
            ori_cache[ori_cache.length - 1].yaw * Math.PI / 180.0);
        var z = mot.gacc_x * rotation_matrix[0][2] + mot.gacc_y * rotation_matrix[1][2] + mot.gacc_z * rotation_matrix[2][2]
        gacc_z.push(z);
        console.log(z)

        mot_cache.push(mot);
        mot_cache.splice(0, mot_cache.length - cache_length);

        //alert(mot_cache[mot_cache.length - 1].time.split('.')[0])
        var date1 = new Date(mot_cache[mot_cache.length - 1].time.split('.')[0]);
        var date2 = new Date(mot_cache[0].time.split('.')[0]);
        //alert(date1 - date2)
        if (Math.abs(date1 - date2) > time_interval) {
            filter_post_status = 'NG';
            //filter_ng_time += time_interval;
            //if (mot_cache.length >= 10) {
            var geo_temp = geo_cache.filter(geo_ => new Date(geo_.time.split('.')[0]).getTime() > new Date(mot_cache[0].time.split('.')[0]).getTime() - 1000 && new Date(geo_.time.split('.')[0]).getTime() < new Date(mot_cache[mot_cache.length - 1].time.split('.')[0]).getTime());

            if (geo_temp.length < time_interval / 1000) { // recive gps stable
                filter_post_status = 'GPS不穩定';
                console.log(filter_post_status);
            } else {
                var dist_sum = 0;
                var pt_str = '';
                var data = {};
                var points = [];
                var smooth_index = [];

                for (var i = 0; i < geo_temp.length; i++) {
                    points.push([geo_temp[i].latitude, geo_temp[i].longitude]);
                    pt_str += geo_temp[i].latitude + " " + geo_temp[i].longitude + ","
                    if (i != 0) {
                        dist_sum += distFromlatlng(geo_temp[i - 1].latitude, geo_temp[i - 1].longitude, geo_temp[i].latitude, geo_temp[i].longitude);
                    }
                }
                pt_str = pt_str.substring(0, pt_str.length - 1);
                data.points = points;

                if (dist_sum <= 10) {
                    filter_post_status = '低速或靜止(' + dist_sum + ')';
                    console.log(filter_post_status);
                } else if (dist_sum >= 500) {
                    filter_post_status = '速度異常(' + dist_sum + ')';
                    console.log(filter_post_status);
                } else {
                    // console.log(dist_sum)
                    var stdZ = standardDeviation(gacc_z);
                    var latlng = geo_temp[parseInt(geo_temp.length / 2)].latitude + ' ' + geo_temp[parseInt(geo_temp.length / 2)].longitude;

                    var geolocation_accuracy = geo_temp.reduce(function(sum, value) {
                        return sum + value.accuracy;
                    }, 0) / geo_temp.length;

                    var geolocation_speed = geo_temp.reduce(function(sum, value) {
                        return sum + value.speed;
                    }, 0) / geo_temp.length;

                    data.smooth_index = stdZ;

                    var d = new Date(mot_cache[0].time.split('.')[0]);
                    var utc = d.getTime() + (d.getTimezoneOffset() * 60000);
                    // var d8 = new Date(utc + (3600000 * 8));
                    var d8 = new Date(utc);
                    // console.log(d8);

                    var postdata = JSON.stringify({
                        //"time": mot_cache[0].time,
                        "time": d8,
                        //"smooth_index": stdZ,
                        "std_section": stdZ,
                        "source": configs.id,
                        "points": pt_str,
                        //"remark": pt_str,
                        "latlng": latlng,
                        "uuid": configs.uuid,
                        "vehicle_type": configs.vehicle,
                        "user": configs.name,
                        "geolocation_accuracy": geolocation_accuracy,
                        "geolocation_speed": geolocation_speed
                    });
                    // $.post('/insertDB', postdata);
                    //$.post(configs.push_url, postdata);
                    filter_post_num += 1;
                    filter_post_status = 'OK';
                    console.log(stdZ);
                    console.log(filter_post_status + '(' + filter_post_num + ')');
                    //filter_ng_time = 0;

                    mot_cache = [];
                    gacc_z = [];
                    return postdata;
                }
            }
            mot_cache = [];
            gacc_z = [];
        }
    }
    return null;
}
geo_filter = function(geo) {
    geo_cache.push(geo);
    geo_cache.splice(0, geo_cache.length - cache_length);
    return true;
}

postSomeThing = function() {
    $.post('/insertDB', JSON.stringify({ time: new Date() }))
}
distFromlatlng = function(lat0, lng0, lat1, lng1) {
    return Math.sqrt(Math.pow(lat0 - lat1, 2) + Math.pow(lng0 - lng1, 2)) * scale_dist;
}
detection_onhand_old = function() {
    var ori_temp = ori_cache.filter(ori_ =>
        new Date(ori_.time.split('.')[0]).getTime() > new Date(mot_cache[0].time.split('.')[0]).getTime() &&
        new Date(ori_.time.split('.')[0]).getTime() < new Date(mot_cache[mot_cache.length - 1].time.split('.')[0]).getTime());

    var alpha = ori_temp.map(ori_temp => Math.round((ori_temp.alpha + 360) % 360));
    var beta = ori_temp.map(ori_temp => Math.round((ori_temp.beta + 360) % 360));
    var gamma = ori_temp.map(ori_temp => Math.round((ori_temp.gamma + 360) % 360));

    var sum_a = 0;
    var sum_b = 0;
    var sum_g = 0;
    for (var i = 1; i < alpha.length; i++) {
        var da = Math.abs(alpha[i] - alpha[i - 1]) < Math.abs(alpha[i] - (alpha[i - 1] + 360) % 360) ? Math.abs(alpha[i] - alpha[i - 1]) : Math.abs(alpha[i] - (alpha[i - 1] + 360) % 360);
        var db = Math.abs(beta[i] - beta[i - 1]) < Math.abs(beta[i] - (beta[i - 1] + 360) % 360) ? Math.abs(beta[i] - beta[i - 1]) : Math.abs(beta[i] - (beta[i - 1] + 360) % 360);
        var dg = Math.abs(gamma[i] - gamma[i - 1]) < Math.abs(gamma[i] - (gamma[i - 1] + 360) % 360) ? Math.abs(gamma[i] - gamma[i - 1]) : Math.abs(gamma[i] - (gamma[i - 1] + 360) % 360);
        sum_a += da;
        sum_b += db;
        sum_g += dg;

        // var d_alpha = Math.abs(da) > (360 - Math.abs(da)) ? (360 - Math.abs(da)) : Math.abs(da);
        // var d_beta = Math.abs(db) > (360 - Math.abs(db)) ? (360 - Math.abs(db)) : Math.abs(db);
        // var d_gamma = Math.abs(dg) > (360 - Math.abs(dg)) ? (360 - Math.abs(dg)) : Math.abs(dg);
        // sum_a += d_alpha;
        // sum_b += d_beta;
        // sum_g += d_gamma;
    }
    var sum = Math.abs(sum_a) + Math.abs(sum_b) + Math.abs(sum_g);
    //alert(sum / alpha.length);
    if (sum > 90) {
        return true;
        //return false;
    } else {
        return false;
    }
}
detection_onhand = function() {
    var ori_temp = ori_cache;
    var num = ori_temp.length;
    // var alpha = ori_temp.map(ori_temp => Math.round((ori_temp.alpha + 360) % 360));
    // var beta = ori_temp.map(ori_temp => Math.round((ori_temp.beta + 360) % 360));
    // var gamma = ori_temp.map(ori_temp => Math.round((ori_temp.gamma + 360) % 360));

    // check 1: sum(abs(dif(per)))
    // var sum_a = 0;
    // var sum_b = 0;
    // var sum_g = 0;
    // for (var i = 1; i < alpha.length; i++) {
    //     var da = Math.abs(alpha[i] - alpha[i - 1]) < Math.abs(alpha[i] - (alpha[i - 1] + 360) % 360) ? Math.abs(alpha[i] - alpha[i - 1]) : Math.abs(alpha[i] - (alpha[i - 1] + 360) % 360);
    //     var db = Math.abs(beta[i] - beta[i - 1]) < Math.abs(beta[i] - (beta[i - 1] + 360) % 360) ? Math.abs(beta[i] - beta[i - 1]) : Math.abs(beta[i] - (beta[i - 1] + 360) % 360);
    //     var dg = Math.abs(gamma[i] - gamma[i - 1]) < Math.abs(gamma[i] - (gamma[i - 1] + 360) % 360) ? Math.abs(gamma[i] - gamma[i - 1]) : Math.abs(gamma[i] - (gamma[i - 1] + 360) % 360);
    //     sum_a += da;
    //     sum_b += db;
    //     sum_g += dg;
    // }


    // check 2: dif(end-start)
    // var d_a = (ori_temp[0].alpha * Math.PI / 180 - ori_temp[num - 1].alpha * Math.PI / 180);
    // var dif_a = Math.abs(Math.atan2(Math.sin(d_a), Math.cos(d_a)) / Math.PI * 180);

    // var d_b = (ori_temp[0].beta * Math.PI / 180 - ori_temp[num - 1].beta * Math.PI / 180);
    // var dif_b = Math.abs(Math.atan2(Math.sin(d_b), Math.cos(d_b)) / Math.PI * 180);

    // var d_g = (ori_temp[0].gamma * Math.PI / 180 - ori_temp[num - 1].gamma * Math.PI / 180);
    // var dif_g = Math.abs(Math.atan2(Math.sin(d_g), Math.cos(d_g)) / Math.PI * 180);
    // var dif_a = Math.abs(alpha[0] - alpha[num - 1]) <
    //     Math.abs(alpha[0] - ((alpha[num - 1] + 360) % 360)) ?
    //     Math.abs(alpha[0] - alpha[num - 1]) :
    //     Math.abs(alpha[0] - ((alpha[num - 1] + 360) % 360));

    // var dif_b = Math.abs(beta[0] - beta[num - 1]) <
    //     Math.abs(beta[0] - ((beta[num - 1] + 360) % 360)) ?
    //     Math.abs(beta[0] - beta[num - 1]) :
    //     Math.abs(beta[0] - ((beta[num - 1] + 360) % 360));

    // var dif_g = Math.abs(gamma[0] - gamma[num - 1]) <
    //     Math.abs(gamma[0] - ((gamma[num - 1] + 360) % 360)) ?
    //     Math.abs(gamma[0] - gamma[num - 1]) :
    //     Math.abs(gamma[0] - ((gamma[num - 1] + 360) % 360));

    //var dif = Math.abs(dif_a) + Math.abs(dif_b) + Math.abs(dif_g);
    // var sum = Math.abs(sum_a) + Math.abs(sum_b) + Math.abs(sum_g);
    // dif_a = Math.min(dif_a, Math.abs(180 - dif_a));
    // dif_b = Math.min(dif_b, Math.abs(180 - dif_b));
    // dif_g = Math.min(dif_g, Math.abs(180 - dif_g));

    // if (dif_a > 30 || dif_b > 30 || dif_g > 30) {
    //     if (Math.abs(dif_a - dif_g) < 3 && dif_b < 30) {
    //         return false;
    //     } else {
    //         filter_post_status = Math.round(ori_temp[0].alpha) + ',' + Math.round(ori_temp[num - 1].alpha) + ',' + Math.round(dif_a) + "</br>" +
    //             Math.round(ori_temp[0].beta) + ',' + Math.round(ori_temp[num - 1].beta) + ',' + Math.round(dif_b) + "</br>" +
    //             Math.round(ori_temp[0].gamma) + ',' + Math.round(ori_temp[num - 1].gamma) + ',' + Math.round(dif_g);
    //         return true;
    //     }

    // } else {
    //     return false;
    // }

    // chk3:angle between two normal vector
    var rotation_matrix0 = R_Matrix(ori_temp[0].beta * Math.PI / 180.0,
        ori_temp[0].gamma * Math.PI / 180.0,
        ori_temp[0].alpha * Math.PI / 180.0);
    var normalvector0 = [rotation_matrix0[0][2], rotation_matrix0[1][2], rotation_matrix0[2][2]];

    var rotation_matrix1 = R_Matrix(ori_temp[ori_cache.length - 1].beta * Math.PI / 180.0,
        ori_temp[ori_cache.length - 1].gamma * Math.PI / 180.0,
        ori_temp[ori_cache.length - 1].alpha * Math.PI / 180.0);
    var normalvector1 = [rotation_matrix1[0][2], rotation_matrix1[1][2], rotation_matrix1[2][2]];
    var dif_angle = angleFrom2vector(normalvector0, normalvector1);
    if (Math.abs(dif_angle) > 30) {
        filter_post_status = "手機使用中" + Math.round(dif_angle);
        return true;
    } else {
        return false;
    }
}

function angleFrom2vector(v1, v2) {
    var dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    var normv1 = Math.sqrt(Math.pow(v1[0], 2) + Math.pow(v1[1], 2) + Math.pow(v1[2], 2));
    var normv2 = Math.sqrt(Math.pow(v2[0], 2) + Math.pow(v2[1], 2) + Math.pow(v2[2], 2));
    return Math.acos(dot / (normv1 * normv2)) / Math.PI * 180;;
}

function standardDeviation(values) {
    var avg = average(values);

    var squareDiffs = values.map(function(value) {
        var diff = value - avg;
        var sqrDiff = diff * diff;
        return sqrDiff;
    });

    var avgSquareDiff = average(squareDiffs);

    var stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
}

function average(data) {
    var sum = data.reduce(function(sum, value) {
        return sum + value;
    }, 0);

    var avg = sum / data.length;
    return avg;
}

function R_Matrix(w, p, k) {
    var Rw = [];
    var Rp = [];
    var Rk = [];

    Rw[0] = [1, 0, 0];
    Rw[1] = [0, Math.cos(w), Math.sin(w)];
    Rw[2] = [0, -Math.sin(w), Math.cos(w)];

    Rp[0] = [Math.cos(p), 0, -Math.sin(p)];
    Rp[1] = [0, 1, 0];
    Rp[2] = [Math.sin(p), 0, Math.cos(p)];

    Rk[0] = [Math.cos(k), Math.sin(k), 0];
    Rk[1] = [-Math.sin(k), Math.cos(k), 0];
    Rk[2] = [0, 0, 1];

    R = AdotB(Rp, AdotB(Rw, Rk));
    return R;
}

function AdotB(A, B) {
    var m = A.length;
    var n = A[0].length;
    var m1 = B.length;
    var n1 = B[0].length;

    var Answer = [];
    var sum;
    if (n == m1) {
        for (var i = 0; i < m; i++) {
            var ans = [];
            for (var j = 0; j < n1; j++) {
                sum = 0;
                for (var k = 0; k < n; k++) {
                    sum = sum + A[i][k] * B[k][j];
                }
                ans.push(sum)
            }
            Answer.push(ans);
        }
        return Answer;
    } else {
        throw new Exception("Wrong dimension in AdotB");
    }
}