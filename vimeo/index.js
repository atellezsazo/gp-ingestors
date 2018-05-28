'use strict';

const cheerio = require('cheerio');
const fs = require('fs');
const libingester = require('libingester');
const rp = require('request-promise');
const url = require('url');

const BASE_URL = 'https://vimeo.com';
const PATH_SEARCH = 'https://vimeo.com/search/sort:latest?price=free&';
const LICENSE_PARAMETER = 'license=by';
const SEARCH_URL = PATH_SEARCH + LICENSE_PARAMETER;
const USER_AGENT = 'AppleWebKit';
const QUERY_PARAMETER = '&q=';
const QUALITY = '360p'; // 540p
const DEFAULT_TITLE = "Photo";

let hatch; // global
let json_img_data = {
    images: {}, videos: {}
};

function download_video_and_thumbnail(video) {
    let $video = cheerio('<div><video></video></div>'); // will be replaced
    const asset_image = libingester.util.download_image(video.thumbnail_url);
    const asset_video = libingester.util.get_embedded_video_asset($video.find('video'), video.download_url);
    asset_image.set_title(video.name);
    asset_video.set_title(video.name);
    asset_video.set_thumbnail(asset_image);
    // save references
    video.asset_image = asset_image;
    video.asset_video = asset_video;
    video.$video = $video;
    // download
    hatch.save_asset(asset_image);
    hatch.save_asset(asset_video);
    // json metadata
    json_img_data.images[asset_image.asset_id] = {
        author: video.username,
        title: video.name,
        uri: video.thumbnail_url,
        videoId: asset_video.asset_id
    };
    json_img_data.videos[asset_video.asset_id] = {
        author: video.username,
        downloadUri: video.download_url,
        title: video.name,
        thumb: video.thumbnail_url,
        thumbId: asset_image.asset_id,
        uri: video.link,
    };
}

function add_download_link(video) {
    return libingester.util.fetch_html(video.link).then($ => {
        const script = $('div.wrap_content').first().text();
        let data = script.substr(script.indexOf('window.vimeo.clip_page_config') + 32);
        data = data.substr(0, data.indexOf('"page_type":"Video"') + 21);
        let config_url;
        try {
            data = JSON.parse(data);
            config_url = data.player.config_url;
        } catch(e) {
            console.log("Video not found", video.link, e);
            return Promise.reject("Video not found: " + video.link);
        }
        return rp(config_url).then(json_str => {
            let json = JSON.parse(json_str);
            let link = '';
            if (json.request.files.progressive == 0) {
                return Promise.reject("Video not found");
            }
            // find link by quality
            for (let link_data of json.request.files.progressive) {
                if (link_data.quality == QUALITY) {
                    link = link_data.url; break;
                }
            }
            if (!link) link = json.request.files.progressive[0].link || '';
            video.download_url = link;
            download_video_and_thumbnail(video);
        });
    })
}

function get_video_links(uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const script = $('script').last().text();
        let data = script.substr(script.indexOf('data = ') + 7);
        data = data.substr(0, data.indexOf('"type":"search"') + 17);
        let videos = [], add_dw_promises = [];
        try {
            data = JSON.parse(data).filtered.data;
        } catch(e) {
            console.log("Videos not found");
            return Promise.reject("Videos not found");
        }

        for (let clip of data) {
            if (clip.type == 'clip') {
                let video  = clip.clip;
                videos.push(video);
                video.username = ''; // default
                // find thumbnail
                try { video.thumbnail_url = video.pictures.sizes[0].link } catch(e) {}
                // find username
                try { video.username = video.user.name || '' } catch(e) {}
                // find download url
                add_dw_promises.push( add_download_link(video) );
            };
        }
        
        return Promise.all(add_dw_promises).then(() => videos);
    })
}

function ingest(uri, search) {
    return get_video_links(uri).then(videos => {
        const $ = cheerio;
        const asset = new libingester.BlogArticle();
        const $body = $('<div></div>');

        videos.forEach((el, i) => {
            el.name = el.name || 'Untitled';
            const $h2 = $(`<h2>${el.name}</h2>`);
            const $p = $('<p></p>');

            $body.append($h2);
            if (el.username) $body.append( $p.append(el.username) );
            $body.append(el.$video);
        });

        asset.set_title(search || DEFAULT_TITLE);
        asset.set_body($body);
        asset.set_canonical_uri(uri);
        asset.set_thumbnail(videos[0].asset_image);
        asset.render();

        hatch.save_asset(asset);
        return videos;
    });
}

function build_search_uri(search) {
    search = encodeURI(search || '');
    return SEARCH_URL + QUERY_PARAMETER + search;
}

function main() {
    const search = process.argv[2] || '';
    const strSearch = search.replace(/ /, '_');
    const uri = build_search_uri(search);
    
    libingester.util.set_user_agent(USER_AGENT);
    hatch = new libingester.Hatch('vimeo_' + strSearch, 'en');

    ingest(uri, search).then(videos => {
        hatch.finish();
        fs.writeFileSync(hatch._path.replace('hatch','') + '.json', JSON.stringify(json_img_data));
    });
}

main();