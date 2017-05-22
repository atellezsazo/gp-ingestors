'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');

const base_uri = 'https://www.bola.net/';
const gallery_uri = 'https://www.bola.net/galeri/';
const rss_uri = 'https://www.bola.net/feed/';

// clean images
const remove_attr = [
    'class',
    'data-src',
    'data-te-category',
    'data-te-label',
    'data-te-tracked',
    'src',
    'style'
];

// Remove elements (body)
const remove_elements = [
    '.clear',
    '.detail-slot-youtube',
    '.promo-ta',
    '.related_content_widget',
    '.twitter-tweet',
    '#iframe_video_partner',
    '#infeed-desktop-cont',
    'iframe',
    'link',
    'script',
    'style',
];

const remove_parent_elements = [
    'iframe',
];

// embed video
const video_iframes = [
    'a.kapanlagi',
    'skrin.id',
    'streamable',
    'youtube',
];

// promise download image
const rp_download_image = (hatch, src, image) => {
    return rp({
        uri: src,
        encoding: null,
        headers: {
            'User-Agent': 'libingester',
        },
        resolveWithFullResponse: true,
    }).then((response) => {
        image.set_canonical_uri(src);
        image.set_last_modified_date(new Date());
        image.set_image_data(response.headers['content-type'], response.body);
        hatch.save_asset(image);
    }).catch((err) => {
        return rp_download_image(hatch, src, image);
    });
}

// render
const render_template = (hatch, asset, template, post_data) => {
    const content = mustache.render(template, post_data);
    asset.set_document(content);
    hatch.save_asset(asset);
}

function pad(n, width, z='0') {
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function ingest_article(hatch, obj) {
    return libingester.util.fetch_html(obj.uri).then(($) => {
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(obj.uri);
        const section = $('meta[name="keywords"]').attr('content');
        asset.set_section(section);
        asset.set_title(obj.title);
        const synopsis = $('meta[property="og:description"]').attr('content');
        asset.set_synopsis(synopsis);
        const category = $('div.nav').first();
        category.find('a').map(function() {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
            for(const attr of remove_attr) {
                $(this).removeAttr(attr);
            }
        });

        const modified_time = $('div.newsdatetime').text();
        let date = new Date(Date.parse(obj.pubDate));
        if (!date) {
            date = new Date();
        }
        asset.set_last_modified_date(date);

        // main image
        const main_image_uri = $('meta[property="og:image"]').attr('content');
        const main_image = new libingester.ImageAsset();
        main_image.set_title(obj.title);
        const promise_main = rp_download_image(hatch, main_image_uri, main_image);
        asset.set_thumbnail(main_image);
        const body = $('div.ncont').first();

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        for(const element of remove_elements) {
            body.find(element).remove();
        }

        const promises_images = Promise.map(body.find('img').get(), (img) => {
            const src = img.attribs['data-src'];
            const image = new libingester.ImageAsset();
            image.set_title(obj.title);
            img.attribs["data-libingester-asset-id"] = image.asset_id;
            return rp_download_image(hatch, src, image);
        }, {concurrency: Infinity}).then(() => {
            const post_data = {
                title: obj.title,
                published: modified_time,
                category: category.html(),
                main_image: main_image,
                body: body.html(),
            }

            render_template(hatch, asset, template.structure_template, post_data);
        });

        return Promise.all([promises_images, promise_main]);
    }).catch((err) => {
        return ingest_article(hatch, obj);
    });
}

function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);
        const section = $('meta[name="keywords"]').attr('content');
        asset.set_section(section);
        const title = $('.photonews_title').text();
        asset.set_title(title);
        const synopsis = $('.photonews_desc').text();
        asset.set_synopsis(synopsis);
        const category = $('div.nav').first();
        category.find('a').map(function() {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
            for(const attr of remove_attr) {
                $(this).removeAttr(attr);
            }
        });

        const modified_time = $('div.photonewsdatetime').text();
        let pd = modified_time;
        pd = pd.substring(pd.indexOf(',')+2,pd.length);
        pd = pd.split('-');
        pd = pd[1] + '-' + pd[0] + '-' + pd[2];
        let date = new Date(pd);
        if (!date) {
            date = new Date();
        }
        asset.set_last_modified_date(date);

        // main image
        let image_id = [];
        const main_image_uri = $('.photonews_image img').first().attr('data-src');
        const main_image = new libingester.ImageAsset();
        asset.set_thumbnail(main_image);
        main_image.set_title(title);
        const promise_main = rp_download_image(hatch, main_image_uri, main_image);
        image_id.push({id: main_image.asset_id});

        // max number of images
        let max_num = $('.photonews_top').first();
        max_num.find('a').remove();
        max_num = max_num.text();
        const firstIndex = max_num.indexOf('1 dari')+7;
        const lastIndex = max_num.indexOf('foto')-1;
        max_num = parseInt(max_num.substring(firstIndex, lastIndex));

        // download gallery images
        let image_uris = [];
        for(var i=2; i<=max_num; i++){
            image_uris.push( main_image_uri.replace('001-bola',pad(i,3)+'-bola') );
        }

        const promises_images = Promise.map(image_uris, function(img_uri) {
            const image = new libingester.ImageAsset();
            image.set_title(title);
            image_id.push({id: image.asset_id});
            return rp_download_image(hatch, img_uri, image);
        }, {concurrency: 10}).then(() => {
            const post_data = {
                title: title,
                published: modified_time,
                category: category.html(),
                gallery: image_id,
                body: synopsis,
            }
            render_template(hatch, asset, template.template_gallery, post_data);
        });

        return Promise.all([promises_images, promise_main]);
    }).catch((err) => {
        return ingest_gallery(hatch, uri);
    });
}

function ingest_video(hatch, obj) {
    return libingester.util.fetch_html(obj.uri).then(($) => {
        const date = new Date(Date.parse(obj.pubDate));
        const synopsis = $('meta[name="description"]').attr('content');
        const title = obj.title || $('.op-line h1').text();

        // background video (thumbnail)
        const thumb_url = $('meta[property="og:image"]').attr('content');

        const save_video_asset = (video_url) => {
            if (video_url) {
                // thumbnail
                const thumbnail = new libingester.ImageAsset();
                thumbnail.set_title(title);
                return rp_download_image(hatch, thumb_url, thumbnail).then(() => {
                    const video = new libingester.VideoAsset();
                    video.set_canonical_uri(obj.uri);
                    video.set_download_uri(video_url);
                    video.set_last_modified_date(date);
                    video.set_thumbnail(thumbnail);
                    video.set_title(title);
                    video.set_synopsis(synopsis);
                    hatch.save_asset(video);
                });
            }
        }

        // save video asset
        const video_page = $('.ncont iframe').first().attr('src');
        if (video_page) {
            for (const domain of video_iframes) {
                if (video_page.includes(domain)) {
                    switch (domain) {
                        case 'a.kapanlagi': {
                            return libingester.util.fetch_html(video_page).then(($) => {
                                const video_url = $('title').text();
                                return save_video_asset(video_url);
                            });
                            break; // exit 'a.kapanlagi'
                        }
                        case 'skrin.id': {
                            const base_video_uri = 'https://play.skrin.id/media/videoarchive/';
                            const video_width = '480p.mp4';
                            let video_url;
                            return libingester.util.fetch_html(video_page).then(($) => {
                                const ss = $('script')[3].children[0].data; //script data
                                const json_sources = ss.substring(ss.indexOf('JSON.parse(\'['), ss.indexOf(']\');')).replace('JSON.parse(\'[','');
                                let temp_uri;
                                const video_uris = json_sources.split('},').map((uri) => {
                                    const relative_video_uri = uri.substring(uri.indexOf('url')+7, uri.indexOf('resolution')-3);
                                    return url.resolve(base_video_uri, relative_video_uri);
                                });
                                for (const video_uri of video_uris) {
                                    if (video_uri.includes(video_width)) {
                                        temp_uri = video_uri;
                                        break;
                                    }
                                }
                                video_url = temp_uri || video_uris[video_uris.length-1];
                                return save_video_asset(video_url);
                            });
                            break; // exit 'skrin.id'
                        }
                        default: {
                            return save_video_asset(video_page);
                        }
                    }
                }
            }
        }
    }).catch((err) => {
        return ingest_video(hatch, obj);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const concurrency = 3;

    const article = libingester.util.fetch_html(rss_uri).then(($) => {
        let data = [];
        for (const item of $('item').get()){
            const category = $(item).find('category').text();
            if( category != 'galeri' ) {
                data.push({
                    author: $(item).find('author').text(),
                    category: category,
                    pubDate: $(item).find('pubDate').text(),
                    title: $(item).find('title').html().replace('<!--[CDATA[','').replace(']]-->',''),
                    uri: $(item).find('link')[0].next['data'].replace('\n','').replace("'",""),
                });
            }
        }

        return Promise.map(data, function(obj) {
            if( obj.uri.includes('open-play') ) {
                return ingest_video(hatch, obj);
            } else {
                return ingest_article(hatch, obj);
            }
        }, { concurrency: concurrency });
    });

    const galery = libingester.util.fetch_html(gallery_uri).then(($) => {
        const data = $('.photonews_preview .title').get().map((item) => {
            return url.resolve(gallery_uri, item.attribs.href);
        });

        return Promise.map(data, function(uri) {
            return ingest_gallery(hatch, uri);
        }, { concurrency: concurrency });
    });

    Promise.all([article, galery]).then(() => {
        return hatch.finish();
    });
}

main();
